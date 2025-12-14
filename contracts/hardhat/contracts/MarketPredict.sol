// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface AggregatorV3Interface {
    function latestRoundData()
        external
        view
        returns (
            uint80 roundId,
            int256 answer,
            uint256 startedAt,
            uint256 updatedAt,
            uint80 answeredInRound
        );
    function decimals() external view returns (uint8);
}

contract MarketPredict is UUPSUpgradeable, OwnableUpgradeable {
    // ============ Constants ============
    uint256 public constant FEE_BPS = 290; // 2.9% on profits
    uint256 public constant BPS_DIVISOR = 10000;
    uint256 public constant MIN_BET = 0.1 ether;
    uint256 public constant MAX_STRING_LENGTH = 256;

    // ============ Enums & Structs ============
    enum MarketType { MANUAL, ORACLE }
    enum MarketStatus { OPEN, RESOLVED, CANCELLED }

    struct Market {
        string question;
        string description;
        string category;
        uint256 yesPool;
        uint256 noPool;
        uint256 endTime;
        bool resolved;
        bool outcome;
        MarketType marketType;
        MarketStatus status;
        address creator;
        address token;
        address priceFeed;
        int256 targetPrice;
    }

    // ============ State ============
    mapping(uint256 => Market) public markets;
    mapping(uint256 => mapping(address => uint256)) public yesAmounts;
    mapping(uint256 => mapping(address => uint256)) public noAmounts;
    mapping(uint256 => mapping(address => bool)) public hasClaimed;
    mapping(address => uint256) public balances;
    mapping(address => string) public usernames;
    mapping(address => string) public avatars;

    uint256 public nextId;
    uint256 public collectedFees;
    bool public globalPaused;

    // ============ Events ============
    event Deposit(address indexed user, uint256 amount);
    event Withdraw(address indexed user, uint256 amount);
    event MarketCreated(uint256 indexed id, string question, uint256 endTime, MarketType marketType);
    event Predicted(address indexed user, uint256 indexed id, bool choice, uint256 amount);
    event Resolved(uint256 indexed id, bool outcome);
    event Cancelled(uint256 indexed id);
    event Refunded(address indexed user, uint256 indexed id, uint256 amount);
    event WinningsClaimed(address indexed user, uint256 indexed id, uint256 gross, uint256 fee, uint256 net);
    event UsernameSet(address indexed user, string username);
    event AvatarSet(address indexed user, string avatar);
    event GlobalPaused(bool paused);

    // ============ Modifiers ============
    modifier notPaused() {
        require(!globalPaused, "Contract paused");
        _;
    }
    modifier validMarket(uint256 id) {
        require(id < nextId, "Market not found");
        _;
    }

    // ============ Initialization ============
    function initialize() public initializer {
        __Ownable_init(msg.sender);
        nextId = 0;
        globalPaused = false;
    }

    function _authorizeUpgrade(address) internal override onlyOwner {}

    // ============ User Profile ============
    function setUsername(string calldata name) external {
        require(bytes(name).length <= MAX_STRING_LENGTH, "Name too long");
        usernames[msg.sender] = name;
        emit UsernameSet(msg.sender, name);
    }

    function setAvatar(string calldata avatarUri) external {
        require(bytes(avatarUri).length <= MAX_STRING_LENGTH, "Avatar URI too long");
        avatars[msg.sender] = avatarUri;
        emit AvatarSet(msg.sender, avatarUri);
    }

    // ============ Deposit/Withdraw ============
    function deposit() external payable notPaused {
        require(msg.value > 0, "Deposit must be > 0");
        balances[msg.sender] += msg.value;
        emit Deposit(msg.sender, msg.value);
    }

    function withdraw(uint256 amount) external notPaused {
        require(balances[msg.sender] >= amount, "Insufficient balance");
        balances[msg.sender] -= amount;
        (bool success, ) = payable(msg.sender).call{value: amount}("");
        require(success, "Transfer failed");
        emit Withdraw(msg.sender, amount);
    }

    // ============ Market Creation ============
    function createMarket(
        string calldata question,
        string calldata description,
        string calldata category,
        uint256 duration,
        MarketType marketType,
        address priceFeed,
        int256 targetPrice
    ) external onlyOwner notPaused returns (uint256) {
        // FIXED: Changed from 365 days to 3650 days (10 years)
        require(duration > 0 && duration <= 3650 days, "Invalid duration");
        require(bytes(question).length > 0 && bytes(question).length <= 500, "Invalid question");
        
        if (marketType == MarketType.ORACLE) {
            require(priceFeed != address(0), "Oracle market needs priceFeed");
        }

        uint256 id = nextId++;
        Market storage m = markets[id];
        m.question = question;
        m.description = description;
        m.category = category;
        m.endTime = block.timestamp + duration;
        m.marketType = marketType;
        m.status = MarketStatus.OPEN;
        m.creator = msg.sender;
        m.priceFeed = priceFeed;
        m.targetPrice = targetPrice;
        m.token = address(0);

        emit MarketCreated(id, question, m.endTime, marketType);
        return id;
    }

    // ============ Predict ============
    function predict(uint256 id, bool choice, uint256 amount) external notPaused validMarket(id) {
        Market storage m = markets[id];
        require(block.timestamp < m.endTime, "Market closed");
        require(m.status == MarketStatus.OPEN, "Market not open");
        require(amount >= MIN_BET, "Below minimum bet");
        require(balances[msg.sender] >= amount, "Insufficient balance");

        balances[msg.sender] -= amount;

        if (choice) {
            m.yesPool += amount;
            yesAmounts[id][msg.sender] += amount;
        } else {
            m.noPool += amount;
            noAmounts[id][msg.sender] += amount;
        }

        emit Predicted(msg.sender, id, choice, amount);
    }

    // ============ Resolve ============
    function resolve(uint256 id, bool outcome) external onlyOwner notPaused validMarket(id) {
        Market storage m = markets[id];
        require(m.status == MarketStatus.OPEN, "Market not open");
        require(block.timestamp >= m.endTime, "Market not ended");
        m.resolved = true;
        m.outcome = outcome;
        m.status = MarketStatus.RESOLVED;
        emit Resolved(id, outcome);
    }

    function resolveWithOracle(uint256 id) external onlyOwner notPaused validMarket(id) {
        Market storage m = markets[id];
        require(m.marketType == MarketType.ORACLE, "Not oracle market");
        require(m.status == MarketStatus.OPEN, "Market not open");
        require(block.timestamp >= m.endTime, "Market not ended");
        require(m.priceFeed != address(0), "No price feed");

        AggregatorV3Interface feed = AggregatorV3Interface(m.priceFeed);
        (, int256 price, , uint256 updatedAt, ) = feed.latestRoundData();
        require(block.timestamp - updatedAt <= 1 hours, "Price stale");

        bool outcome = price >= m.targetPrice;
        m.resolved = true;
        m.outcome = outcome;
        m.status = MarketStatus.RESOLVED;
        emit Resolved(id, outcome);
    }

    // ============ Claim ============
    function claim(uint256 id) external notPaused validMarket(id) {
        Market storage m = markets[id];
        require(m.resolved, "Market not resolved");
        require(!hasClaimed[id][msg.sender], "Already claimed");

        uint256 userAmount;
        uint256 totalPool = m.yesPool + m.noPool;

        if (m.outcome) {
            userAmount = yesAmounts[id][msg.sender];
            require(userAmount > 0, "No winning position");
        } else {
            userAmount = noAmounts[id][msg.sender];
            require(userAmount > 0, "No winning position");
        }

        // Handle edge case: if totalPool is 0, refund original amount
        if (totalPool == 0) {
            hasClaimed[id][msg.sender] = true;
            balances[msg.sender] += userAmount;
            emit WinningsClaimed(msg.sender, id, userAmount, 0, userAmount);
            return;
        }

        uint256 winningPool = m.outcome ? m.yesPool : m.noPool;
        uint256 grossPayout = (userAmount * totalPool) / winningPool;
        uint256 profit = grossPayout > userAmount ? grossPayout - userAmount : 0;
        uint256 fee = (profit * FEE_BPS) / BPS_DIVISOR;
        uint256 net = grossPayout - fee;

        hasClaimed[id][msg.sender] = true;
        collectedFees += fee;
        balances[msg.sender] += net;

        emit WinningsClaimed(msg.sender, id, grossPayout, fee, net);
    }

    // ============ Refund (for Cancelled Markets) ============
    function refund(uint256 id) external notPaused validMarket(id) {
        Market storage m = markets[id];
        require(m.status == MarketStatus.CANCELLED, "Market not cancelled");
        require(!hasClaimed[id][msg.sender], "Already refunded");

        uint256 refundAmount = yesAmounts[id][msg.sender] + noAmounts[id][msg.sender];
        require(refundAmount > 0, "Nothing to refund");

        hasClaimed[id][msg.sender] = true;
        balances[msg.sender] += refundAmount;

        emit Refunded(msg.sender, id, refundAmount);
    }

    // ============ Cancel Market ============
    function cancelMarket(uint256 id) external onlyOwner notPaused validMarket(id) {
        Market storage m = markets[id];
        require(m.status == MarketStatus.OPEN, "Market not open");
        m.status = MarketStatus.CANCELLED;
        emit Cancelled(id);
    }

    // ============ Admin ============
    function setGlobalPause(bool pause) external onlyOwner {
        globalPaused = pause;
        emit GlobalPaused(pause);
    }

    function withdrawFees(uint256 amount) external onlyOwner {
        require(amount <= collectedFees, "Insufficient fees");
        collectedFees -= amount;
        (bool success, ) = payable(owner()).call{value: amount}("");
        require(success, "Fee transfer failed");
    }

    // ============ View Functions ============
    function getMarketBasics(uint256 id) external view validMarket(id) returns (
        string memory question,
        string memory description,
        string memory category,
        uint256 endTime,
        MarketType marketType,
        MarketStatus status
    ) {
        Market storage m = markets[id];
        return (m.question, m.description, m.category, m.endTime, m.marketType, m.status);
    }

    function getMarketPools(uint256 id) external view validMarket(id) returns (
        uint256 yesPool,
        uint256 noPool,
        bool resolved,
        bool outcome
    ) {
        Market storage m = markets[id];
        return (m.yesPool, m.noPool, m.resolved, m.outcome);
    }

    function getUserPosition(uint256 id, address user) external view validMarket(id) returns (
        uint256 yesAmount,
        uint256 noAmount,
        bool claimed
    ) {
        return (yesAmounts[id][user], noAmounts[id][user], hasClaimed[id][user]);
    }

    function getBalance(address user) external view returns (uint256) {
        return balances[user];
    }

    // ============ Helper View Functions (for frontend compat) ============
    function marketCount() external view returns (uint256) {
        return nextId;
    }

    // FIXED: Changed to return closeTime (which is endTime) for frontend compatibility
    function getMarket(uint256 id) external view validMarket(id) returns (
        string memory question,
        uint256 closeTime,  // Changed from endTime to closeTime
        uint256 status,
        bool outcome,
        uint256 yesPool,
        uint256 noPool,
        address creator,
        uint256 marketType
    ) {
        Market storage m = markets[id];
        return (
            m.question,
            m.endTime,  // This is closeTime
            uint256(m.status),
            m.outcome,
            m.yesPool,
            m.noPool,
            m.creator,
            uint256(m.marketType)
        );
    }

    function getPosition(uint256 id, address user) external view validMarket(id) returns (
        uint256 yesShares,
        uint256 noShares,
        uint256 yesAmount,
        uint256 noAmount,
        bool claimed
    ) {
        return (0, 0, yesAmounts[id][user], noAmounts[id][user], hasClaimed[id][user]);
    }

    function calculatePotentialWinnings(uint256 id, bool isYes) external view validMarket(id) returns (uint256) {
        Market storage m = markets[id];
        if (!m.resolved) return 0;
        
        uint256 userAmount = isYes ? yesAmounts[id][msg.sender] : noAmounts[id][msg.sender];
        if (userAmount == 0) return 0;
        if ((isYes && !m.outcome) || (!isYes && m.outcome)) return 0; // User didn't win
        
        uint256 totalPool = m.yesPool + m.noPool;
        if (totalPool == 0) return userAmount;
        
        uint256 winningPool = m.outcome ? m.yesPool : m.noPool;
        uint256 grossPayout = (userAmount * totalPool) / winningPool;
        uint256 profit = grossPayout > userAmount ? grossPayout - userAmount : 0;
        uint256 fee = (profit * FEE_BPS) / BPS_DIVISOR;
        return grossPayout - fee;
    }
}