//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;

import "./IVenusToken.sol";


interface IVenusPriceOracle {
    function getUnderlyingPrice(IVenusToken vToken) external view returns (uint);
}
