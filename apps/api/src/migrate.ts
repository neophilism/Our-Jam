import { postgres, migrate } from './db.js';
const url=process.env.DATABASE_URL_UNPOOLED;
if(!url)throw new Error('DATABASE_URL_UNPOOLED is required for migrations.');
if(new URL(url).hostname.includes('-pooler'))throw new Error('Migrations require the direct connection.');
const db=postgres(url);
try{await migrate(db);console.log('Our Jam migrations applied.');}finally{await db.close();}
