// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

/**
 * @title MarketPredict
 * @dev Scaffold contract for the BDAG prediction dApp
 */
contract MarketPredict {
    struct Market {
        string question;
        uint256 yesPool;
        uint256 noPool;
        bool isActive;
        address creator;
    }

    mapping(uint256 => Market) public markets;
    uint256 public nextMarketId;

    event MarketCreated(uint256 indexed id, string question, address creator);
    event PredictionMade(uint256 indexed id, bool choice, uint256 amount, address predictor);

    // placeholder: create market
    function createMarket(string memory _question) external {
        markets[nextMarketId] = Market(_question, 0, 0, true, msg.sender);
        emit MarketCreated(nextMarketId, _question, msg.sender);
        nextMarketId++;
    }

    // placeholder: make prediction
    function predict(uint256 _id, bool _choice) external payable {
        require(markets[_id].isActive, "Market not active");
        if (_choice) markets[_id].yesPool += msg.value;
        else markets[_id].noPool += msg.value;
        emit PredictionMade(_id, _choice, msg.value, msg.sender);
    }
}

