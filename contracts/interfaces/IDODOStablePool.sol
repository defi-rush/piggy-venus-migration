//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;


library PMMPricing {
    enum RState {ONE, ABOVE_ONE, BELOW_ONE}
}

interface IDODOStablePool {
    function querySellQuote(
        address trader,
        uint256 payQuoteAmount
    ) external view returns (
        uint256 receiveBaseAmount,
        uint256 mtFee,
        PMMPricing.RState newRState,
        uint256 newQuoteTarget
    );

    function querySellBase(
        address trader,
        uint256 payBaseAmount
    ) external view returns (
        uint256 receiveQuoteAmount,
        uint256 mtFee,
        PMMPricing.RState newRState,
        uint256 newBaseTarget
    );

    function flashLoan(
        uint256 baseAmount,
        uint256 quoteAmount,
        address assetTo,
        bytes calldata data
    ) external;
}
