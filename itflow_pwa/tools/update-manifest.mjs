import {execFileSync} from 'node:child_process';import {createHash} from 'node:crypto';import {readFileSync,writeFileSync,statSync} from 'node:fs';import {fileURLToPath} from 'node:url';import path from 'node:path';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const paths=execFileSync('git',['ls-files','-z'],{cwd:root,encoding:'utf8'}).split('\0').filter(p=>p&&p!=='MANIFEST.sha256'&&(()=>{try{return statSync(path.join(root,p)).isFile()}catch{return false}})()).sort();
writeFileSync(path.join(root,'MANIFEST.sha256'),paths.map(p=>createHash('sha256').update(readFileSync(path.join(root,p))).digest('hex')+'  '+p+'\n').join(''));
console.log('Updated root manifest for '+paths.length+' tracked files. Stage new files before running this script.');
