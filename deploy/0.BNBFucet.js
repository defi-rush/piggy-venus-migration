module.exports = async ({
  getNamedAccounts, deployments, getChainId,
  ethernal
}) => {
  const { deploy } = deployments;
  const chainId = await getChainId();
  if (+chainId != 56) {
    // 在主链上不能部署 fucet
    const { deployer } = await getNamedAccounts();
    const BNBFucet = await deploy('BNBFucet', {
      from: deployer,
      log: true,
      args: ['greeting from xd'],
      // 部署的时候发送 10000 bnb 过去
      value: ethers.utils.parseEther('10000')
    });
    ethernal.push({
      name: 'BNBFucet',
      address: BNBFucet.address
    });
  }
}
