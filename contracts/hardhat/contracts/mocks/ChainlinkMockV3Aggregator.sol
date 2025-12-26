// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @dev Minimal Chainlink-style AggregatorV3 mock used for tests.
/// This intentionally does NOT import Chainlink sources, to avoid compiling
/// dependency contracts and generating huge TypeChain bindings.
contract ChainlinkMockV3Aggregator {
    uint8 private immutable _decimals;
    int256 private _answer;
    uint80 private _roundId;
    uint256 private _startedAt;
    uint256 private _updatedAt;
    uint80 private _answeredInRound;

    constructor(uint8 decimals_, int256 initialAnswer) {
        _decimals = decimals_;
        _answer = initialAnswer;
        _roundId = 1;
        _startedAt = block.timestamp;
        _updatedAt = block.timestamp;
        _answeredInRound = 1;
    }

    function decimals() external view returns (uint8) {
        return _decimals;
    }

    function latestRoundData()
        external
        view
        returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)
    {
        return (_roundId, _answer, _startedAt, _updatedAt, _answeredInRound);
    }

    function updateAnswer(int256 newAnswer) external {
        _answer = newAnswer;
        _roundId += 1;
        _startedAt = block.timestamp;
        _updatedAt = block.timestamp;
        _answeredInRound = _roundId;
    }
}
