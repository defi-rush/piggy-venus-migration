//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;

import "./IVenusToken.sol";


interface IVenusComptroller {
    function getAccountLiquidity(address account) external view returns (uint, uint, uint);
    function markets(address vTokenAddress) external view returns (bool, uint, bool);
}
