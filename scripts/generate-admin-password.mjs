/** Executar localmente; não salva a senha gerada em arquivos. */
import crypto from 'node:crypto';
const password=crypto.randomBytes(24).toString('base64url');
const salt=crypto.randomBytes(16).toString('hex');
console.log('\n=== TDB 8.3.1: credenciais ADM novas ===');
console.log('NOVA SENHA ADM (guarde fora do Git; mostrada uma única vez): '+password);
console.log('\nVariáveis para a Vercel/servidor:');
console.log('TDB_ADMIN_USERNAME=adm');
console.log('TDB_ADMIN_PASSWORD_SALT='+salt);
console.log('TDB_ADMIN_PASSWORD_HASH='+crypto.scryptSync(password,salt,64).toString('hex'));
console.log('\nNunca envie a senha/variáveis para o repositório ou cole em chats.');
