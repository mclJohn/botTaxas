import Web3 from 'web3';
import dotenv from 'dotenv';
import chalk from 'chalk'; // Import chalk for colored outputs

dotenv.config();

// Configurações da rede Lisk
const chainId = 1135;
const rpcUrl = "https://rpc.api.lisk.com";

let web3 = new Web3(new Web3.providers.HttpProvider(rpcUrl, {
    keepAlive: true,
    timeout: 10000 // Timeout da requisição para 10 segundos
}));

const privateKeys = process.env.PRIVATE_KEYS.split(',');
const wethLiskContract = "0x4200000000000000000000000000000000000006"; // Contrato WETH na Lisk

// ABI do contrato WETH
const wethAbi = [
    {
        "constant": true,
        "inputs": [{ "name": "owner", "type": "address" }],
        "name": "balanceOf",
        "outputs": [{ "name": "", "type": "uint256" }],
        "payable": false,
        "stateMutability": "view",
        "type": "function"
    },
    {
        "constant": false,
        "inputs": [{ "name": "wad", "type": "uint256" }],
        "name": "withdraw",
        "outputs": [],
        "payable": false,
        "stateMutability": "nonpayable",
        "type": "function"
    },
    {
        "constant": false,
        "inputs": [],
        "name": "deposit",
        "outputs": [],
        "payable": true,
        "stateMutability": "payable",
        "type": "function"
    }
];

// Instância do contrato WETH
const wethContract = new web3.eth.Contract(wethAbi, wethLiskContract);

// Helper function para delay
function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Função para obter taxas de gas dinamicamente
async function getGasFees() {
    try {
        const block = await web3.eth.getBlock("latest");
        const baseFeePerGas = BigInt(block.baseFeePerGas || 0);
        const maxPriorityFeePerGas = BigInt(web3.utils.toWei('1', 'gwei'));
        const maxFeePerGas = baseFeePerGas + maxPriorityFeePerGas * BigInt(2);

        return {
            maxFeePerGas: maxFeePerGas.toString(),
            maxPriorityFeePerGas: maxPriorityFeePerGas.toString()
        };
    } catch (error) {
        console.error("Erro ao obter taxas de gas:", error);
        throw error;
    }
}

// Função para obter transações do dia
async function getTodayTransactions(walletAddress) {
    try {
        const currentDate = new Date().toISOString().split('T')[0];
        const fetch = (await import('node-fetch')).default;
        const apiUrl = `https://blockscout.lisk.com/api/v2/addresses/${walletAddress}/transactions?filter=from`;

        const response = await fetch(apiUrl);
        if (!response.ok) {
            console.error(`Erro ao buscar transações para ${walletAddress}: ${response.statusText} (Status: ${response.status})`);
            return 0; // Retorna 0 transações para evitar interrupção
        }

        const data = await response.json();
        if (!data.items || !Array.isArray(data.items)) {
            console.log(`Resposta inválida ou nenhuma transação encontrada para ${walletAddress}.`);
            return 0;
        }

        const transactions = data.items.filter(tx => tx.timestamp);
        const todayTransactions = transactions.filter(tx => {
            const txDate = new Date(tx.timestamp).toISOString().split('T')[0];
            return txDate === currentDate;
        });

        console.log(`Transações hoje para ${walletAddress}: ${todayTransactions.length}`);
        return todayTransactions.length;
    } catch (error) {
        console.error(`Erro inesperado ao buscar transações para ${walletAddress}:`, error);
        return 0; // Retorna 0 transações em caso de erro
    }
}

// Função para verificar saldo de WETH
async function checkAndWithdrawWeth(privateKey) {
    const account = web3.eth.accounts.privateKeyToAccount(privateKey);
    const wethBalance = await wethContract.methods.balanceOf(account.address).call();

    if (parseFloat(web3.utils.fromWei(wethBalance, 'ether')) > 0) {
        console.log(`Wallet ${account.address} tem ${web3.utils.fromWei(wethBalance, 'ether')} WETH. Realizando saque...`);
        await withdrawWeth(privateKey, wethBalance);
    }
}

// Função para depositar WETH
async function depositWeth(privateKey, valueInWei) {
    const account = web3.eth.accounts.privateKeyToAccount(privateKey);
    try {
        const gasFees = await getGasFees();

        const gasOptions = {
            from: account.address,
            to: wethLiskContract,
            value: valueInWei,
            gas: 100000,
            maxFeePerGas: gasFees.maxFeePerGas,
            maxPriorityFeePerGas: gasFees.maxPriorityFeePerGas,
            data: wethContract.methods.deposit().encodeABI()
        };

        const signedTx = await web3.eth.accounts.signTransaction(gasOptions, privateKey);
        const receipt = await web3.eth.sendSignedTransaction(signedTx.rawTransaction);
        console.log(`Depositado ${web3.utils.fromWei(valueInWei, 'ether')} WETH em ${account.address}`);
    } catch (error) {
        console.error(`Falha ao depositar WETH:`, error);
    }
}

// Função para sacar WETH
async function withdrawWeth(privateKey, valueInWei) {
    const account = web3.eth.accounts.privateKeyToAccount(privateKey);
    try {
        const gasFees = await getGasFees();

        const gasOptions = {
            from: account.address,
            to: wethLiskContract,
            gas: 100000,
            maxFeePerGas: gasFees.maxFeePerGas,
            maxPriorityFeePerGas: gasFees.maxPriorityFeePerGas,
            data: wethContract.methods.withdraw(valueInWei).encodeABI()
        };

        const signedTx = await web3.eth.accounts.signTransaction(gasOptions, privateKey);
        const receipt = await web3.eth.sendSignedTransaction(signedTx.rawTransaction);
        console.log(`Sacado ${web3.utils.fromWei(valueInWei, 'ether')} WETH de ${account.address}`);
    } catch (error) {
        console.error(`Falha ao sacar WETH:`, error);
    }
}

// Função principal
async function main() {
    for (const privateKey of privateKeys) {
        const account = web3.eth.accounts.privateKeyToAccount(privateKey);

        // Verifica saldo de WETH antes de começar
        await checkAndWithdrawWeth(privateKey);

        // Aguarda 10 segundos antes de buscar loops
        await delay(10000);

        // Obtém número de transações do dia
        const transactionsToday = await getTodayTransactions(account.address);
        const loopsRemaining = Math.max(0, 40 - transactionsToday); // Exemplo: 10 loops por dia

        for (let i = 0; i < loopsRemaining; i++) {
            console.log(`Iniciando loop ${i + 1} para ${account.address}...`);
        
            // Depositar um valor aleatório
            const randomValue = Math.random() * (0.000002 - 0.000001) + 0.000001;
            const valueInWei = web3.utils.toWei(randomValue.toString(), 'ether');
        
            await depositWeth(privateKey, valueInWei);
        
            // Aguarda 5 segundos antes de realizar o saque
            await delay(3000);
        
            // Sacar o valor depositado
            await withdrawWeth(privateKey, valueInWei);
        
            console.log(`Loop ${i + 1} concluído.`);
            await delay(5000); // Espera de 1 segundo antes do próximo loop
        }

        console.log(`Wallet ${account.address} finalizada.`);
    }
}

main().catch(error => console.error(`Erro no script:`, error));
