// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
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

contract MarketPredict is Initializable, OwnableUpgradeable {
    // ============ Constants ============
    uint256 public constant FEE_BPS = 290; // 2.9% on profits
    uint256 public constant BPS_DIVISOR = 10000;
    uint256 public constant MIN_BET = 0.1 ether;
    uint256 public constant MAX_STRING_LENGTH = 256;
    uint256 public constant DISPUTE_WINDOW = 2 hours;

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
        bool paused;
        // Dispute system: only one dispute ever per market.
        bool disputeUsed;
        bool disputeActive;
        address disputeOpener;
        uint256 disputeBond;
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
    // Pauser address (can pause/unpause globally)
    address public pauser;

    // Permissioned market writers (can create markets without being owner)
    mapping(address => bool) public marketWriters;

    // Disputes: per-market mapping of disputants
    mapping(uint256 => mapping(address => bool)) public disputes;
    mapping(uint256 => uint256) public disputeCount;

    // Bond required to open a dispute (paid from internal `balances`)
    uint256 public disputeBondWei;

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
    event MarketPaused(uint256 indexed id, bool paused);
    event MarketEdited(uint256 indexed id);
    event DisputeOpened(uint256 indexed id, address indexed user, string reason);
    event DisputeResolved(uint256 indexed id, address indexed user, bool upheld);

    // ============ Modifiers ============
    modifier notPaused() {
        require(!globalPaused, "Contract paused");
        _;
    }
    modifier validMarket(uint256 id) {
        require(id < nextId, "Market not found");
        _;
    }
    modifier marketNotPaused(uint256 id) {
        require(!globalPaused, "Contract paused");
        require(!markets[id].paused, "Market paused");
        _;
    }

    // ============ Initialization ============
    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize() public initializer {
        __Ownable_init(msg.sender);
        nextId = 0;
        globalPaused = false;
        // Default: require at least MIN_BET worth of bond to open a dispute.
        disputeBondWei = MIN_BET;
    }

    // ============ Roles ============
    function setPauser(address _pauser) external onlyOwner {
        pauser = _pauser;
    }

    function setMarketWriter(address writer, bool allowed) external onlyOwner {
        marketWriters[writer] = allowed;
    }

    modifier onlyOwnerOrWriter() {
        require(msg.sender == owner() || marketWriters[msg.sender], "Not authorized");
        _;
    }

    function setDisputeBondWei(uint256 bondWei) external onlyOwner {
        require(bondWei > 0, "Bond must be > 0");
        disputeBondWei = bondWei;
    }

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
    ) external onlyOwnerOrWriter notPaused returns (uint256) {
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
    function predict(uint256 id, bool choice, uint256 amount) external validMarket(id) marketNotPaused(id) {
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

        uint8 decimals = feed.decimals();
        require(decimals <= 18, "Unsupported oracle decimals");

        int256 scaledPrice = price;
        if (decimals < 18) {
            scaledPrice = price * int256(10 ** (18 - decimals));
        }

        bool outcome = scaledPrice >= m.targetPrice;
        m.resolved = true;
        m.outcome = outcome;
        m.status = MarketStatus.RESOLVED;
        emit Resolved(id, outcome);
    }

    // ============ Claim ============
    function claim(uint256 id) external validMarket(id) marketNotPaused(id) {
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
    function cancelMarket(uint256 id) public onlyOwner notPaused validMarket(id) {
        Market storage m = markets[id];
        require(m.status == MarketStatus.OPEN, "Market not open");
        m.status = MarketStatus.CANCELLED;
        emit Cancelled(id);
    }

    // ============ Admin ============
    function setGlobalPause(bool pause) external {
        require(msg.sender == owner() || msg.sender == pauser, "Not authorized");
        globalPaused = pause;
        emit GlobalPaused(pause);
    }

    // Creator: pause individual market
    function setMarketPause(uint256 id, bool pause) external validMarket(id) {
        Market storage m = markets[id];
        require(msg.sender == m.creator || msg.sender == owner(), "Not market creator");
        m.paused = pause;
        emit MarketPaused(id, pause);
    }

    // Creator: edit market metadata if no bets placed and still open
    function editMarket(uint256 id, string calldata question, string calldata description, string calldata category) external validMarket(id) {
        Market storage m = markets[id];
        require(msg.sender == m.creator || msg.sender == owner(), "Not market creator");
        require(m.status == MarketStatus.OPEN, "Market not open");
        require(m.yesPool + m.noPool == 0, "Market has bets");
        if (bytes(question).length > 0) m.question = question;
        if (bytes(description).length > 0) m.description = description;
        if (bytes(category).length > 0) m.category = category;
        emit MarketEdited(id);
    }

    // ============ Disputes ============
    // Any participant can open exactly one dispute per market, paid with a bond from internal balance.
    // Safety: disputes can only be opened AFTER the market ends, but BEFORE it's resolved, to avoid
    // situations where payouts already occurred (double-pay risk).
    function openDispute(uint256 id, string calldata reason) external validMarket(id) notPaused {
        Market storage m = markets[id];
        require(m.status == MarketStatus.OPEN, "Market not open");
        require(block.timestamp >= m.endTime, "Market not ended");
        require(block.timestamp <= m.endTime + DISPUTE_WINDOW, "Dispute window closed");
        require(!m.disputeUsed, "Dispute already used");
        require(yesAmounts[id][msg.sender] > 0 || noAmounts[id][msg.sender] > 0, "Must have position to dispute");
        require(balances[msg.sender] >= disputeBondWei, "Insufficient balance for bond");

        // Lock in the one-and-only dispute.
        m.disputeUsed = true;
        m.disputeActive = true;
        m.disputeOpener = msg.sender;
        m.disputeBond = disputeBondWei;

        // Escrow the bond (held by contract until resolved).
        balances[msg.sender] -= disputeBondWei;

        // Freeze the market while disputed.
        m.paused = true;
        emit MarketPaused(id, true);

        // Keep legacy dispute mappings coherent (even though only one dispute is allowed).
        disputes[id][msg.sender] = true;
        disputeCount[id] = 1;

        emit DisputeOpened(id, msg.sender, reason);
    }

    // Only owner can resolve the single dispute.
    // - If upheld: cancel market and refund the bond to the dispute opener.
    // - If rejected: unpause market and keep the bond as fees.
    function resolveDispute(uint256 id, address disputant, bool uphold) external onlyOwner validMarket(id) {
        Market storage m = markets[id];
        require(m.disputeActive, "No active dispute");
        require(disputant == m.disputeOpener, "Not dispute opener");

        m.disputeActive = false;
        disputes[id][disputant] = false;
        disputeCount[id] = 0;

        uint256 bond = m.disputeBond;

        if (uphold) {
            // Cancel market and allow refunds
            if (m.status == MarketStatus.OPEN || m.status == MarketStatus.RESOLVED) {
                m.status = MarketStatus.CANCELLED;
                emit Cancelled(id);
            }
            // Return bond to disputant
            if (bond > 0) {
                balances[disputant] += bond;
            }
            // Market can remain paused; refunds are still available.
        } else {
            // Keep bond as protocol fees
            if (bond > 0) {
                collectedFees += bond;
            }
            // Unpause so owner can resolve as normal
            m.paused = false;
            emit MarketPaused(id, false);
        }

        emit DisputeResolved(id, disputant, uphold);
    }

    // Convenience view for UIs (creator/admin tools)
    function getMarketAdmin(uint256 id) external view validMarket(id) returns (
        address creator,
        bool paused,
        bool disputeUsed,
        bool disputeActive,
        address disputeOpener,
        uint256 disputeBond
    ) {
        Market storage m = markets[id];
        return (m.creator, m.paused, m.disputeUsed, m.disputeActive, m.disputeOpener, m.disputeBond);
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