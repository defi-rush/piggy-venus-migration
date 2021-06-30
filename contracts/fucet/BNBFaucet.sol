//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;

import "hardhat/console.sol";


contract BNBFaucet {
    string greeting;
    address owner;

    modifier onlyOwner() {
        require(msg.sender == owner, "ERR_NOT_OWNER");
        _;
    }

    constructor(string memory _greeting) payable {
        console.log("Deploying a BNBFaucet with greeting:", _greeting);
        greeting = _greeting;
        owner = msg.sender;
    }

    function greet() public view returns (string memory) {
        return greeting;
    }

    function setGreeting(string memory _greeting) public {
        console.log("Changing greeting from '%s' to '%s'", greeting, _greeting);
        greeting = _greeting;
    }

    function balance() external view returns (uint256) {
        // return payable(address(this))
        return address(this).balance;
    }

    function _sendBNB(uint256 amount, address _to) private {
        require(amount <= 10000000000000000000, "too much amount");
        payable(_to).transfer(amount);
    }

    // 因为一开始用户没有 bnb, 这个方法其实是由 deployer 来执行, 然后把钱给 _to
    function giveBNB(uint256 amount, address _to) external onlyOwner {
        _sendBNB(amount, _to);
    }

    // 保留这个方法是为了演示 overload function 在 ethers.js 里如何表现
    function giveBNB(uint256 amount) external {
        _sendBNB(amount, msg.sender);
    }

    function requestBNB(uint256 amount) external {
        _sendBNB(amount, msg.sender);
    }
}
