//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;

import "hardhat/console.sol";

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
// import "@openzeppelin/contracts/access/Ownable.sol";

import "./interfaces/IPiggyReward.sol";


contract PiggyReward is ERC20, IPiggyReward {
    using SafeERC20 for IERC20;

    IERC20 public immutable tokenPiggy;

    address public governance;
    address public vaultMigration;
    uint256 public rewardMultipler;

    constructor(
        string memory _name,
        string memory _symbol,
        address _vaultMigration,
        uint256 _rewardMultipler,
        IERC20 _tokenPiggy
    ) ERC20(_name, _symbol) {
        governance = msg.sender;
        vaultMigration = _vaultMigration;
        rewardMultipler = _rewardMultipler;
        tokenPiggy = _tokenPiggy;
        /* allow governance to transfer out piggy */
        _tokenPiggy.approve(governance, type(uint256).max);
    }

    function decimals() public pure override returns (uint8) {
       return 18;
    }

    function setGovernance(address _governance) public {
        require(msg.sender == governance, "!governance");
        tokenPiggy.approve(governance, 0);
        governance = _governance;
        tokenPiggy.approve(governance, type(uint256).max);
    }

    function setVaultMigration(address _vaultMigration) public {
        require(msg.sender == governance, "!governance");
        vaultMigration = _vaultMigration;
    }

    function setRewardMultipler(uint256 _rewardMultipler) public {
        require(msg.sender == governance, "!governance");
        rewardMultipler = _rewardMultipler;
    }

    function _transferOut(address _to, uint256 _amount) internal {
        require(tokenPiggy.balanceOf(address(this)) >= _amount, "withdraw amount exceeds pool balance");
        _burn(_to, _amount);  // _burn will check user balance first
        tokenPiggy.safeTransfer(_to, _amount);
    }

    function reward(address _account, uint256 _nums) external override {
        require(msg.sender == vaultMigration, "!vaultMigration");
        uint256 _amount = _nums * rewardMultipler;
        _mint(_account, _amount);
        if (tokenPiggy.balanceOf(address(this)) >= _amount) {
            _transferOut(_account, _amount);
        }
        /*
        TODO还需要另一个方法来 rewardAll
        */
    }

    function claimReward(uint256 _amount) external override {
        _transferOut(msg.sender, _amount);
    }

}
