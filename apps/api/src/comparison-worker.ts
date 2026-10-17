import { postgres } from "./db.js";
import { configuredStorage } from "./generation-config.js";
import { comparisonGenerationTick } from "./comparison-inference.js";
if(process.env.COMPARISON_GENERATION_ENABLED!=="1")
  throw new Error("Enable comparison generation explicitly before starting the private worker.");
if(!process.env.DATABASE_URL)throw new Error("Comparison worker requires this project's DATABASE_URL.");
const store=configuredStorage();
if(!store)throw new Error("Comparison worker requires project-private media storage.");
const db=postgres(process.env.DATABASE_URL);
let stopping=false;
for(const signal of ["SIGINT","SIGTERM"])
  process.on(signal,()=>{stopping=true;});
try {
  while(!stopping){
    try {
      await comparisonGenerationTick(db,{store});
    }catch {console.error(JSON.stringify({event:"comparison_worker_tick_failed"}));}
    if(!stopping)await new Promise(resolve=>setTimeout(resolve,2000));
  }
}finally{await db.close();}
