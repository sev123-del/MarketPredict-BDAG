// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title MarketPredict - BlockDAG Prediction Market (Internal Balance Version)
/// @notice Users deposit BDAG into the dApp, then use that balance to make predictions.
/// @dev Simplified version for Buildathon MVP (Wave 3).

contract MarketPredict {
    address public owner;

    /// @notice Internal dApp balance per user (BDAG stored in this contract)
    mapping(address => uint256) public balances;

    /// @notice Minimum time in the future for a market to close (3 days)
    uint256 public constant MIN_FUTURE_TIME = 3 days;
    
    /// @notice Initial liquidity added to each pool to prevent division by zero
    uint256 public constant INITIAL_LIQUIDITY = 1 ether;

    struct Market {
        string question;
        uint256 yesPool;
        uint256 noPool;
        bool resolved;
        bool outcomeYes;
        uint256 closeTime; // UNIX timestamp when the market closes
        bool paused; // Owner can pause to prevent new predictions
        mapping(address => uint256) userYesShares; // Shares instead of raw amount
        mapping(address => uint256) userNoShares;
        uint256 totalYesShares; // Track total shares for payout calculation
        uint256 totalNoShares;
    }

    mapping(uint256 => Market) public markets;
    uint256 public nextMarketId;

    // Events
    event MarketCreated(uint256 marketId, string question, uint256 closeTime);
    event PredictionPlaced(uint256 marketId, address user, bool side, uint256 amount);
    event MarketResolved(uint256 marketId, bool outcomeYes);
    event MarketPaused(uint256 marketId);
    event MarketUnpaused(uint256 marketId);
    event Deposited(address indexed user, uint256 amount);
    event Withdrawn(address indexed user, uint256 amount);

    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner");
        _;
    }

    constructor() {
        owner = msg.sender;
    }

    // ------------------------------------------------
    // 🏦 Internal Balance Logic
    // ------------------------------------------------

    /// @notice Deposit BDAG into the dApp balance.
    /// @dev User sends BDAG with this transaction; we credit it to their internal balance.
    function deposit() external payable {
        require(msg.value > 0, "No BDAG sent");
        balances[msg.sender] += msg.value;
        emit Deposited(msg.sender, msg.value);
    }

    /// @notice Withdraw BDAG from the dApp balance back to the user's wallet.
    /// @param amount The amount of BDAG to withdraw (in wei).
    function withdraw(uint256 amount) external {
        require(amount > 0, "Amount must be > 0");
        require(balances[msg.sender] >= amount, "Insufficient balance");

        balances[msg.sender] -= amount;
        payable(msg.sender).transfer(amount);

        emit Withdrawn(msg.sender, amount);
    }

    /// @notice View function: get a user's internal dApp balance.
    function getBalance(address user) external view returns (uint256) {
        return balances[user];
    }

    // ------------------------------------------------
    // 📈 Market Creation & Prediction
    // ------------------------------------------------

    /// @notice Create a new prediction market.
    /// @param _question The market question (e.g., "Will BDAG reach $0.10 before April?")
    /// @param _closeTime The UNIX timestamp when predictions close. Must be at least 3 days in the future.
    function createMarket(string memory _question, uint256 _closeTime) external onlyOwner {
        require(bytes(_question).length > 0, "Question required");
        require(_closeTime >= block.timestamp + MIN_FUTURE_TIME, "Close time too soon");

        Market storage m = markets[nextMarketId];
        m.question = _question;
        m.closeTime = _closeTime;
        
        // Initialize pools with equal liquidity to start at 50/50 odds
        m.yesPool = INITIAL_LIQUIDITY;
        m.noPool = INITIAL_LIQUIDITY;

        emit MarketCreated(nextMarketId, _question, _closeTime);
        nextMarketId++;
    }

    /// @notice Place a prediction using your internal dApp BDAG balance with AMM pricing.
    /// @param _marketId ID of the market.
    /// @param _side true = YES, false = NO.
    /// @param _amount Amount of BDAG to risk (in wei).
    function placePrediction(uint256 _marketId, bool _side, uint256 _amount) external {
        Market storage m = markets[_marketId];

        require(!m.resolved, "Market closed");
        require(!m.paused, "Market paused");
        require(block.timestamp < m.closeTime, "Market expired");
        require(_amount > 0, "Amount must be > 0");
        require(balances[msg.sender] >= _amount, "Insufficient dApp balance");

        // Deduct from user's internal balance
        balances[msg.sender] -= _amount;

        // Calculate shares using AMM formula: shares = (amount * otherPool) / (currentPool + amount)
        // This implements constant product market maker where price changes with pool ratio
        uint256 shares;
        
        if (_side) {
            // Buying YES: shares based on how much NO pool you could win
            shares = (_amount * m.noPool) / (m.yesPool + _amount);
            m.yesPool += _amount;
            m.userYesShares[msg.sender] += shares;
            m.totalYesShares += shares;
        } else {
            // Buying NO: shares based on how much YES pool you could win
            shares = (_amount * m.yesPool) / (m.noPool + _amount);
            m.noPool += _amount;
            m.userNoShares[msg.sender] += shares;
            m.totalNoShares += shares;
        }

        emit PredictionPlaced(_marketId, msg.sender, _side, _amount);
    }
    
    /// @notice Calculate how many shares a user would get for a given amount (for UI preview).
    /// @param _marketId ID of the market.
    /// @param _side true = YES, false = NO.
    /// @param _amount Amount of BDAG user wants to bet.
    /// @return shares The number of shares they would receive.
    function calculateShares(uint256 _marketId, bool _side, uint256 _amount) external view returns (uint256 shares) {
        Market storage m = markets[_marketId];
        
        if (_side) {
            shares = (_amount * m.noPool) / (m.yesPool + _amount);
        } else {
            shares = (_amount * m.yesPool) / (m.noPool + _amount);
        }
    }
    
    /// @notice Get user's shares for a market.
    /// @param _marketId ID of the market.
    /// @param _user Address of the user.
    /// @return yesShares Number of YES shares.
    /// @return noShares Number of NO shares.
    function getUserShares(uint256 _marketId, address _user) external view returns (uint256 yesShares, uint256 noShares) {
        Market storage m = markets[_marketId];
        return (m.userYesShares[_user], m.userNoShares[_user]);
    }

    /// @notice Resolve a market with the final outcome.
    /// @param _marketId ID of the market.
    /// @param _outcomeYes true if YES side wins, false if NO side wins.
    function resolveMarket(uint256 _marketId, bool _outcomeYes) external onlyOwner {
        Market storage m = markets[_marketId];
        require(!m.resolved, "Already resolved");
        require(block.timestamp >= m.closeTime, "Cannot resolve before close time");

        m.resolved = true;
        m.outcomeYes = _outcomeYes;

        emit MarketResolved(_marketId, _outcomeYes);
    }

    /// @notice Pause a market to prevent new predictions (owner only).
    /// @param _marketId ID of the market to pause.
    function pauseMarket(uint256 _marketId) external onlyOwner {
        Market storage m = markets[_marketId];
        require(!m.resolved, "Market already resolved");
        require(!m.paused, "Market already paused");
        
        m.paused = true;
        emit MarketPaused(_marketId);
    }

    /// @notice Unpause a market to allow predictions again (owner only).
    /// @param _marketId ID of the market to unpause.
    function unpauseMarket(uint256 _marketId) external onlyOwner {
        Market storage m = markets[_marketId];
        require(!m.resolved, "Market already resolved");
        require(m.paused, "Market not paused");
        
        m.paused = false;
        emit MarketUnpaused(_marketId);
    }

    // ------------------------------------------------
    // NOTE: Payout / claim logic will be added later:
    // - Users will call claimWinnings(marketId)
    // - Contract will compute share of pool, minus protocol fee
    // - Winnings will be added back into balances[user]
    // ------------------------------------------------
}
