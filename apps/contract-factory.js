const { ethers, getNamedAccounts, deployments } = require('hardhat');
const CONTRACTS = {};

const vTokenABI = [
  'function mint(uint256 mintAmount)',
  'function approve(address spender, uint256 amount) returns (bool)',
  'function redeem(uint redeemTokens) returns (uint)',
  'function redeemUnderlying(uint redeemAmount) returns (uint)',
  'function borrow(uint borrowAmount) returns (uint)',
  'function repayBorrow(uint repayAmount) returns (uint)',
  'function repayBorrowBehalf(address borrower, uint repayAmount) returns (uint)',
  /* 为了让 ethers.Contract.METHOD_NAME 直接返回结果, view 修饰符不能去掉 */
  'function decimals() view returns (uint)',
  'function underlying() view returns (address)',
  'function exchangeRateStored() view returns (uint)',
  'function balanceOf(address account) view returns (uint)',
  'function borrowBalanceStored(address account) view returns (uint)',
  'function getAccountSnapshot(address account) view returns (uint, uint, uint, uint)',
  /* 下面几项要是 write, 因为计算前会先更新利息 */
  'function balanceOfUnderlying(address account) returns (uint)',
  'function accrueInterest() returns (uint)',
  /* 不要用 borrowBalanceCurrent, 获得返回结果不大方便, 他等价于调用 accrueInterest 以后直接读取 borrowBalanceStored */
  // 'function borrowBalanceCurrent(address account) returns (uint)',
  /* Events */
  'event Redeem(address redeemer, uint redeemAmount, uint redeemTokens)',
  'event Borrow(address borrower, uint borrowAmount, uint accountBorrows, uint totalBorrows)',
];

const ERC20ABI = [
  'function deposit() public payable',
  'function withdraw(uint wad)',
  'function symbol() view returns (string)',
  'function totalSupply() view returns (uint256)',
  'function balanceOf(address account) view returns (uint256)',
  'function transfer(address recipient, uint256 amount) returns (bool)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function approve(address spender, uint256 amount) returns (bool)',
  'function transferFrom(address sender, address recipient, uint256 amount) returns (bool)',
  'event Transfer(address indexed from, address indexed to, uint256 value)',
  'event Approval(address indexed owner, address indexed spender, uint256 value)',
];

const ABIs = {
  DODOStablePool: [
    'function flashLoan(uint256 baseAmount, uint256 quoteAmount, address assetTo, bytes calldata data)'
  ],
  VenusComptroller: [
    'function enterMarkets(address[] calldata vTokens) returns (uint[] memory)',
    'function getAssetsIn(address account) view returns (address[] memory)',
    'function getAccountLiquidity(address account) view returns (uint, uint, uint)',
    'function markets(address vTokenAddress) view returns (bool, uint, bool)',
    'event MarketEntered(vToken vToken, address account)',
    'event MarketExited(vToken vToken, address account)',
  ],
  VenusPriceOracle: [
    'function getUnderlyingPrice(address vToken) view returns (uint)',
  ],
  PancakeRouter: [
    'function swapETHForExactTokens(uint amountOut, address[] calldata path, address to, uint deadline) payable returns (uint[] memory amounts)',
    'function swapExactETHForTokens(uint amountOutMin, address[] calldata path, address to, uint deadline) payable returns (uint[] memory amounts)',
    'function getAmountsIn(uint amountOut, address[] memory path) view returns (uint[] memory amounts)',
  ],
  PiggyBorrowerOperations: [
    'function troveManager() view returns (address)',
    'function openTrove(uint _maxFeePercentage, uint _LUSDAmount, address _upperHint, address _lowerHint) payable',
    'function openTroveOnBehalfOf(address _borrower, uint _maxFeePercentage, uint _LUSDAmount, address _upperHint, address _lowerHint) payable',
  ],
  PiggyTroveManager: [
    'function LUSD_GAS_COMPENSATION() view returns (uint256)',
    'function getBorrowingFeeWithDecay(uint _LUSDDebt) view returns (uint)',
    'function getTroveDebt(address _borrower) view returns (uint)',
    'function getTroveColl(address _borrower) view returns (uint)',
  ],
  PiggyHintHelpers: [
    'function getApproxHint(uint _CR, uint _numTrials, uint _inputRandomSeed) view returns (address hintAddress, uint diff, uint latestRandomSeed)',
  ],
  PiggySortedTroves: [
    'function findInsertPosition(uint256 _NICR, address _prevId, address _nextId) view returns (address, address)',
    'function getSize() view returns (uint256)',
  ],
  vBNB: [
    'function mint() payable',
    ...vTokenABI.slice(1),
  ],
  vETH: [ ...vTokenABI ],
  vBUSD: [ ...vTokenABI ],
  vUSDC: [ ...vTokenABI ],
  WBNB: [ ...ERC20ABI ],
  ETH: [ ...ERC20ABI ],
  BUSD: [ ...ERC20ABI ],
  USDC: [ ...ERC20ABI ],
  PUSD: [ ...ERC20ABI ],
  PUSD: [ ...ERC20ABI ],
  PIGGY: [ ...ERC20ABI ],
};

async function getContractInstance(name, signer) {
  let address, abi;
  if (name === 'BNBFaucet') {
    const BNBFucet = await deployments.get('BNBFaucet');
    address = BNBFucet.address;
    abi = BNBFucet.abi;
  } else {
    const accounts = await getNamedAccounts();
    address = accounts[name];
    abi = ABIs[name];
  }
  return new ethers.Contract(address, abi, signer || ethers.provider);
}

module.exports = {
  getContractInstance,
  vTokenABI,
  ERC20ABI,
}
