// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title MarketPredict - BlockDAG Prediction Market (Internal Balance Version)
/// @notice Users deposit BDAG into the dApp, then use that balance to make predictions.
/// @dev Simplified version for Buildathon MVP (Wave 3).

contract MarketPredict {
    address public owner;
    bool public globalPaused; // Emergency pause for entire contract

    /// @notice Internal dApp balance per user (BDAG stored in this contract)
    mapping(address => uint256) public balances;
    
    /// @notice User spending limits per market (0 = no custom limit, use platform max)
    mapping(address => uint256) public userMarketLimit;
    
    /// @notice User self-restriction end time (can't predict until this timestamp)
    mapping(address => uint256) public restrictedUntil;

    /// @notice Minimum time in the future for a market to close (3 days)
    uint256 public constant MIN_FUTURE_TIME = 3 days;
    
    /// @notice Resolution delay after market close (48 hours for dispute period)
    uint256 public constant RESOLUTION_DELAY = 48 hours;
    
    /// @notice Initial liquidity added to each pool to prevent division by zero
    uint256 public constant INITIAL_LIQUIDITY = 1 ether;
    
    /// @notice Platform maximum per market: $25,000 USD @ $0.05/BDAG = 500,000 BDAG
    uint256 public constant PLATFORM_MAX_PER_MARKET = 500000 ether;
    
    /// @notice Minimum prediction amount to prevent spam
    uint256 public constant MIN_PREDICTION = 0.01 ether;

    struct Market {
        string question;
        uint256 yesPool;
        uint256 noPool;
        bool resolved;
        bool outcomeYes;
        uint256 closeTime; // UNIX timestamp when the market closes
        bool paused; // Owner can pause to prevent new predictions
        bool deleted; // Owner can delete market (triggers auto-refunds)
        mapping(address => uint256) userYesShares; // Shares instead of raw amount
        mapping(address => uint256) userNoShares;
        mapping(address => uint256) userYesAmount; // Track original amounts for refunds
        mapping(address => uint256) userNoAmount;
        mapping(address => bool) hasClaimed; // Track if user claimed winnings
        uint256 totalYesShares; // Track total shares for payout calculation
        uint256 totalNoShares;
        uint256 totalYesAmount; // Track total amounts for refunds
        uint256 totalNoAmount;
    }

    mapping(uint256 => Market) public markets;
    uint256 public nextMarketId;

    // Events
    event MarketCreated(uint256 marketId, string question, uint256 closeTime);
    event PredictionPlaced(uint256 marketId, address user, bool side, uint256 amount);
    event MarketResolved(uint256 marketId, bool outcomeYes);
    event MarketPaused(uint256 marketId);
    event MarketUnpaused(uint256 marketId);
    event MarketDeleted(uint256 marketId);
    event Deposited(address indexed user, uint256 amount);
    event Withdrawn(address indexed user, uint256 amount);
    event WinningsClaimed(uint256 marketId, address user, uint256 amount);
    event RefundIssued(uint256 marketId, address user, uint256 amount);
    event UserLimitSet(address user, uint256 limit);
    event UserRestricted(address user, uint256 until);
    event GlobalPauseToggled(bool paused);

    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner");
        _;
    }
    
    modifier whenNotPaused() {
        require(!globalPaused, "Contract is paused");
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
    function deposit() external payable whenNotPaused {
        require(msg.value > 0, "No BDAG sent");
        balances[msg.sender] += msg.value;
        emit Deposited(msg.sender, msg.value);
    }

    /// @notice Withdraw BDAG from the dApp balance back to the user's wallet.
    /// @param amount The amount of BDAG to withdraw (in wei).
    function withdraw(uint256 amount) external whenNotPaused {
        require(amount > 0, "Amount must be > 0");
        require(balances[msg.sender] >= amount, "Insufficient balance");

        // Checks-Effects-Interactions pattern (protection against reentrancy)
        balances[msg.sender] -= amount;
        
        // Using transfer (2300 gas limit) for additional safety
        payable(msg.sender).transfer(amount);

        emit Withdrawn(msg.sender, amount);
    }

    /// @notice View function: get a user's internal dApp balance.
    function getBalance(address user) external view returns (uint256) {
        return balances[user];
    }
    
    // ------------------------------------------------
    // 🛡️ User Self-Control & Limits
    // ------------------------------------------------
    
    /// @notice Set your own spending limit per market (responsible gambling)
    /// @param limit Maximum BDAG you allow yourself to bet per market (0 = use platform max)
    function setMyMarketLimit(uint256 limit) external {
        require(limit == 0 || limit <= PLATFORM_MAX_PER_MARKET, "Limit exceeds platform max");
        userMarketLimit[msg.sender] = limit;
        emit UserLimitSet(msg.sender, limit);
    }
    
    /// @notice Restrict yourself from placing predictions for a period of time
    /// @param duration Number of seconds to restrict (e.g., 86400 = 1 day, 604800 = 1 week)
    function restrictMyself(uint256 duration) external {
        require(duration > 0, "Duration must be > 0");
        uint256 until = block.timestamp + duration;
        restrictedUntil[msg.sender] = until;
        emit UserRestricted(msg.sender, until);
    }
    
    /// @notice Check if user is currently restricted
    function isRestricted(address user) public view returns (bool) {
        return block.timestamp < restrictedUntil[user];
    }
    
    /// @notice Get user's effective market limit (custom or platform max)
    function getEffectiveLimit(address user) public view returns (uint256) {
        uint256 customLimit = userMarketLimit[user];
        return customLimit == 0 ? PLATFORM_MAX_PER_MARKET : customLimit;
    }

    // ------------------------------------------------
    // 📈 Market Creation & Prediction
    // ------------------------------------------------

    /// @notice Create a new prediction market.
    /// @param _question The market question (e.g., "Will BDAG reach $0.10 before April?")
    /// @param _closeTime The UNIX timestamp when predictions close. Must be at least 3 days in the future.
    function createMarket(string memory _question, uint256 _closeTime) external onlyOwner whenNotPaused {
        require(bytes(_question).length > 0, "Question required");
        require(bytes(_question).length <= 500, "Question too long");
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
    function placePrediction(uint256 _marketId, bool _side, uint256 _amount) external whenNotPaused {
        Market storage m = markets[_marketId];

        require(!m.resolved, "Market closed");
        require(!m.paused, "Market paused");
        require(!m.deleted, "Market deleted");
        require(block.timestamp < m.closeTime, "Market expired");
        require(_amount >= MIN_PREDICTION, "Amount below minimum");
        require(balances[msg.sender] >= _amount, "Insufficient dApp balance");
        require(!isRestricted(msg.sender), "You are self-restricted from betting");
        
        // Check user's spending limit for this market
        uint256 userLimit = getEffectiveLimit(msg.sender);
        uint256 userTotalInMarket = m.userYesAmount[msg.sender] + m.userNoAmount[msg.sender];
        require(userTotalInMarket + _amount <= userLimit, "Exceeds your market limit");

        // Deduct from user's internal balance
        balances[msg.sender] -= _amount;

        // Calculate shares using AMM formula: shares = (amount * otherPool) / (currentPool + amount)
        // This implements constant product market maker where price changes with pool ratio
        uint256 shares;
        
        if (_side) {
            // Buying YES: shares based on how much NO pool you could win
            require(m.yesPool > 0 && m.noPool > 0, "Pool depleted");
            shares = (_amount * m.noPool) / (m.yesPool + _amount);
            m.yesPool += _amount;
            m.userYesShares[msg.sender] += shares;
            m.userYesAmount[msg.sender] += _amount;
            m.totalYesShares += shares;
            m.totalYesAmount += _amount;
        } else {
            // Buying NO: shares based on how much YES pool you could win
            require(m.yesPool > 0 && m.noPool > 0, "Pool depleted");
            shares = (_amount * m.yesPool) / (m.noPool + _amount);
            m.noPool += _amount;
            m.userNoShares[msg.sender] += shares;
            m.userNoAmount[msg.sender] += _amount;
            m.totalNoShares += shares;
            m.totalNoAmount += _amount;
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
        require(!m.deleted, "Market deleted");
        require(block.timestamp >= m.closeTime + RESOLUTION_DELAY, "Must wait 48h after close for dispute period");

        m.resolved = true;
        m.outcomeYes = _outcomeYes;

        emit MarketResolved(_marketId, _outcomeYes);
    }
    
    /// @notice Claim your winnings from a resolved market
    /// @param _marketId ID of the market to claim from
    function claimWinnings(uint256 _marketId) external whenNotPaused {
        Market storage m = markets[_marketId];
        require(m.resolved, "Market not resolved yet");
        require(!m.hasClaimed[msg.sender], "Already claimed");
        
        uint256 winnings = 0;
        
        if (m.outcomeYes) {
            // YES won - calculate winnings from YES shares
            uint256 userShares = m.userYesShares[msg.sender];
            if (userShares > 0 && m.totalYesShares > 0) {
                // Proportional share of the NO pool (losing side)
                winnings = (m.noPool * userShares) / m.totalYesShares;
                // Add back original YES amount
                winnings += m.userYesAmount[msg.sender];
            }
        } else {
            // NO won - calculate winnings from NO shares
            uint256 userShares = m.userNoShares[msg.sender];
            if (userShares > 0 && m.totalNoShares > 0) {
                // Proportional share of the YES pool (losing side)
                winnings = (m.yesPool * userShares) / m.totalNoShares;
                // Add back original NO amount
                winnings += m.userNoAmount[msg.sender];
            }
        }
        
        require(winnings > 0, "No winnings to claim");
        
        m.hasClaimed[msg.sender] = true;
        balances[msg.sender] += winnings;
        
        emit WinningsClaimed(_marketId, msg.sender, winnings);
    }

    /// @notice Pause a market to prevent new predictions (owner only).
    /// @param _marketId ID of the market to pause.
    function pauseMarket(uint256 _marketId) external onlyOwner {
        Market storage m = markets[_marketId];
        require(!m.resolved, "Market already resolved");
        require(!m.deleted, "Market deleted");
        require(!m.paused, "Market already paused");
        
        m.paused = true;
        emit MarketPaused(_marketId);
    }

    /// @notice Unpause a market to allow predictions again (owner only).
    /// @param _marketId ID of the market to unpause.
    function unpauseMarket(uint256 _marketId) external onlyOwner {
        Market storage m = markets[_marketId];
        require(!m.resolved, "Market already resolved");
        require(!m.deleted, "Market deleted");
        require(m.paused, "Market not paused");
        
        m.paused = false;
        emit MarketUnpaused(_marketId);
    }
    
    /// @notice Delete a market - triggers automatic refunds for all participants (owner only)
    /// @param _marketId ID of the market to delete
    function deleteMarket(uint256 _marketId) external onlyOwner {
        Market storage m = markets[_marketId];
        require(!m.resolved, "Cannot delete resolved market");
        require(!m.deleted, "Already deleted");
        
        m.deleted = true;
        emit MarketDeleted(_marketId);
        
        // Note: Users must call claimRefund() to get their money back
        // This prevents gas issues with large refund loops
    }
    
    /// @notice Claim refund from a deleted market
    /// @param _marketId ID of the deleted market
    function claimRefund(uint256 _marketId) external whenNotPaused {
        Market storage m = markets[_marketId];
        require(m.deleted, "Market not deleted");
        require(!m.hasClaimed[msg.sender], "Already claimed refund");
        
        uint256 refundAmount = m.userYesAmount[msg.sender] + m.userNoAmount[msg.sender];
        require(refundAmount > 0, "Nothing to refund");
        
        m.hasClaimed[msg.sender] = true;
        balances[msg.sender] += refundAmount;
        
        emit RefundIssued(_marketId, msg.sender, refundAmount);
    }
    
    /// @notice Owner manually issues refund to specific user (for paused/live markets)
    /// @param _marketId ID of the market
    /// @param _user Address of user to refund
    function issueRefund(uint256 _marketId, address _user) external onlyOwner {
        Market storage m = markets[_marketId];
        require(!m.resolved, "Cannot refund resolved market");
        require(!m.hasClaimed[_user], "Already refunded");
        
        uint256 refundAmount = m.userYesAmount[_user] + m.userNoAmount[_user];
        require(refundAmount > 0, "Nothing to refund");
        
        // Mark as claimed to prevent double refund
        m.hasClaimed[_user] = true;
        
        // Remove from pools
        uint256 yesAmount = m.userYesAmount[_user];
        uint256 noAmount = m.userNoAmount[_user];
        
        if (yesAmount > 0) {
            m.yesPool -= yesAmount;
            m.totalYesAmount -= yesAmount;
            m.totalYesShares -= m.userYesShares[_user];
            m.userYesAmount[_user] = 0;
            m.userYesShares[_user] = 0;
        }
        
        if (noAmount > 0) {
            m.noPool -= noAmount;
            m.totalNoAmount -= noAmount;
            m.totalNoShares -= m.userNoShares[_user];
            m.userNoAmount[_user] = 0;
            m.userNoShares[_user] = 0;
        }
        
        balances[_user] += refundAmount;
        
        emit RefundIssued(_marketId, _user, refundAmount);
    }
    
    /// @notice Toggle global emergency pause (owner only)
    function toggleGlobalPause() external onlyOwner {
        globalPaused = !globalPaused;
        emit GlobalPauseToggled(globalPaused);
    }

    // ------------------------------------------------
    // 📊 View Functions
    // ------------------------------------------------
    
    /// @notice Get user's total amount bet in a market
    /// @param _marketId ID of the market
    /// @param _user Address of the user
    /// @return total Total amount user has bet in this market
    function getUserTotalInMarket(uint256 _marketId, address _user) external view returns (uint256 total) {
        Market storage m = markets[_marketId];
        return m.userYesAmount[_user] + m.userNoAmount[_user];
    }
    
    /// @notice Calculate potential winnings for a user (if their side wins)
    /// @param _marketId ID of the market
    /// @param _user Address of the user
    /// @param _side Which side to calculate for (true = YES, false = NO)
    /// @return winnings Potential winnings if that side wins
    function calculatePotentialWinnings(uint256 _marketId, address _user, bool _side) external view returns (uint256 winnings) {
        Market storage m = markets[_marketId];
        
        if (_side) {
            uint256 userShares = m.userYesShares[_user];
            if (userShares > 0 && m.totalYesShares > 0) {
                winnings = (m.noPool * userShares) / m.totalYesShares;
                winnings += m.userYesAmount[_user];
            }
        } else {
            uint256 userShares = m.userNoShares[_user];
            if (userShares > 0 && m.totalNoShares > 0) {
                winnings = (m.yesPool * userShares) / m.totalNoShares;
                winnings += m.userNoAmount[_user];
            }
        }
    }
}
