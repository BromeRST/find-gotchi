export const vaultAbi = `
    [
        {
        "inputs": [
            {
            "internalType": "address",
            "name": "_tokenAddress",
            "type": "address"
            },
            {
            "internalType": "uint256",
            "name": "_tokenId",
            "type": "uint256"
            }
        ],
        "name": "getDepositor",
        "outputs": [
            {
            "internalType": "address",
            "name": "",
            "type": "address"
            }
        ],
        "stateMutability": "view",
        "type": "function"
        }
  ]
`;
