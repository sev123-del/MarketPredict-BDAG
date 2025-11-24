// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract MarketPredict {
    struct Prediction {
        string question;
        uint256 yesPool;
        uint256 noPool;
        uint256 endTime;
        bool resolved;
        bool outcome; // true = YES, false = NO
        mapping(address => uint256) yesAmounts;
        mapping(address => uint256) noAmounts;
    }

    mapping(uint256 => Prediction) public predictions;
    mapping(address => uint256) public balances;

    uint256 public nextId;
    address public owner;

    event Deposit(address indexed user, uint256 amount);
    event Withdraw(address indexed user, uint256 amount);
    event PredictionCreated(uint256 indexed id, string question, uint256 endTime);
    event Predicted(address indexed user, uint256 indexed id, bool choice, uint256 amount);
    event Resolved(uint256 indexed id, bool outcome);

    modifier onlyOwner() {
        require(msg.sender == owner, "Not authorized");
        _;
    }

    constructor() {
        owner = msg.sender;
    }

    // Deposit BDAG (native token)
    function deposit() external payable {
        require(msg.value > 0, "Must deposit > 0");
        balances[msg.sender] += msg.value;
        emit Deposit(msg.sender, msg.value);
    }

    // Withdraw BDAG
    function withdraw(uint256 amount) external {
        require(balances[msg.sender] >= amount, "Insufficient balance");
        balances[msg.sender] -= amount;
        payable(msg.sender).transfer(amount);
        emit Withdraw(msg.sender, amount);
    }

    // Create a prediction (admin only for now)
    function createPrediction(string calldata question, uint256 duration) external onlyOwner {
        Prediction storage p = predictions[nextId];
        p.question = question;
        p.endTime = block.timestamp + duration;
        emit PredictionCreated(nextId, question, p.endTime);
        nextId++;
    }

    // Make a prediction (YES or NO)
    function makePrediction(uint256 id, bool choice, uint256 amount) external {
        Prediction storage p = predictions[id];
        require(block.timestamp < p.endTime, "Market closed");
        require(balances[msg.sender] >= amount, "Not enough balance");

        balances[msg.sender] -= amount;

        if (choice) {
            p.yesPool += amount;
            p.yesAmounts[msg.sender] += amount;
        } else {
            p.noPool += amount;
            p.noAmounts[msg.sender] += amount;
        }

        emit Predicted(msg.sender, id, choice, amount);
    }

    // Resolve the prediction (admin)
    function resolve(uint256 id, bool outcome) external onlyOwner {
        Prediction storage p = predictions[id];
        require(!p.resolved, "Already resolved");
        p.resolved = true;
        p.outcome = outcome;
        emit Resolved(id, outcome);
    }

    // Claim rewards (if user won)
    function claim(uint256 id) external {
        Prediction storage p = predictions[id];
        require(p.resolved, "Not resolved yet");

        uint256 reward;
        if (p.outcome) {
            uint256 userAmount = p.yesAmounts[msg.sender];
            require(userAmount > 0, "No winning prediction");
            reward = (userAmount * (p.yesPool + p.noPool)) / p.yesPool;
            p.yesAmounts[msg.sender] = 0;
        } else {
            uint256 userAmount = p.noAmounts[msg.sender];
            require(userAmount > 0, "No winning prediction");
            reward = (userAmount * (p.yesPool + p.noPool)) / p.noPool;
            p.noAmounts[msg.sender] = 0;
        }

        balances[msg.sender] += reward;
    }
}
