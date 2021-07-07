//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;


interface IPiggyReward {
    function reward(address _account, uint256 _amount) external;
    function claimReward(uint256 _amount) external;
}
