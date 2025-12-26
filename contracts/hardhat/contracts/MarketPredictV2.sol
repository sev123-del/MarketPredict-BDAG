// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./MarketPredict.sol";

contract MarketPredictV2 is MarketPredict {
    function version() external pure returns (string memory) {
        return "v2";
    }
}
