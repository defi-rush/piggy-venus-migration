const { ethers, getNamedAccounts } = require('hardhat');
const CONTRACTS = {};

const vTokenABI = [
  // 'function mint()',
  'function mint() payable',
  'function redeem(uint redeemTokens) returns (uint)',
  'function redeemUnderlying(uint redeemAmount) returns (uint)',
  'function borrow(uint borrowAmount) returns (uint)',
  'function repayBorrow(uint repayAmount) returns (uint)',
  'function repayBorrowBehalf(address borrower, uint repayAmount) returns (uint)',
  /* 为了让 ethers.Contract.METHOD_NAME 直接返回结果, view 修饰符不能去掉 */
  'function decimals() view returns (uint)',
  'function exchangeRateStored() view returns (uint)',
  'function balanceOf(address account) view returns (uint)',
  'function borrowBalanceStored(address account) view returns (uint)',
  /* 下面几项要是 write, 因为计算前会先更新利息 */
  'function balanceOfUnderlying(address account) returns (uint)',
  'function accrueInterest() returns (uint)',
  // 'function borrowBalanceCurrent(address account) returns (uint)',
  /* 不要用 borrowBalanceCurrent, 获得返回结果不大方便, 他等价于调用 accrueInterest 以后直接读取 borrowBalanceStored */
];

const ERC20ABI = [
  'function deposit() public payable',
  'function withdraw(uint wad) public',
  'function approve(address spender, uint256 amount) returns (bool)',
  'function balanceOf(address owner) view returns (uint256)',
]

const ABIs = {
  DODOStablePool: [
    'function flashLoan(uint256 baseAmount, uint256 quoteAmount, address assetTo, bytes calldata data)'
  ],
  VenusComptroller: [
    'function enterMarkets(address[] calldata vTokens) returns (uint[] memory)',
    'function getAssetsIn(address account) view returns (address[] memory)',
    'function getAccountLiquidity(address account) view returns (uint, uint, uint)',
    'event MarketEntered(vToken vToken, address account)',
    'event MarketExited(vToken vToken, address account)'
  ],
  PancakeRouter: [
    'function swapETHForExactTokens(uint amountOut, address[] calldata path, address to, uint deadline) payable returns (uint[] memory amounts)',
    'function swapExactETHForTokens(uint amountOutMin, address[] calldata path, address to, uint deadline) payable returns (uint[] memory amounts)',
    'function getAmountsIn(uint amountOut, address[] memory path) view returns (uint[] memory amounts)',
  ],
  vBNB: [ ...vTokenABI ],
  vBUSD: [ ...vTokenABI ],
  WBNB: [ ...ERC20ABI ],
  BUSD: [ ...ERC20ABI ],
  PUSD: [ ...ERC20ABI ],
};

async function getContractInstance(name, signer) {
  const accounts = await getNamedAccounts();
  const address = accounts[name];
  const abi = ABIs[name];
  return new ethers.Contract(address, abi, signer || ethers.provider);
}

module.exports = {
  getContractInstance
}
