const assert=require('node:assert/strict');
const{PrismaClient}=require('@prisma/client');
const db=new PrismaClient();
(async()=>{try{
 const legacy=await db.product.findMany({where:{brandId:'synthetic-migration-brand'},orderBy:{id:'asc'}});
 assert.equal(legacy.length,3);assert(legacy.every(row=>row.creationKey===null&&row.creationFingerprint===null));assert.equal(legacy[2].name,'Legacy deleted');assert(legacy[2].deletedAt);assert.equal(legacy[0].firstPrice,9900);
 const jobs=await Promise.allSettled(Array.from({length:12},(_,i)=>db.product.create({data:{id:`synthetic-operation-${i}`,brandId:'synthetic-migration-brand',name:'Same allowed name',firstPrice:9900,renewPrice:9900,creationKey:'synthetic-operation-key',creationFingerprint:'synthetic-canonical-fingerprint'}})));
 assert.equal(jobs.filter(result=>result.status==='fulfilled').length,1);assert(jobs.filter(result=>result.status==='rejected').every(result=>result.reason.code==='P2002'));assert.equal(await db.product.count({where:{creationKey:'synthetic-operation-key'}}),1);
 await db.product.create({data:{id:'synthetic-independent',brandId:'synthetic-migration-brand',name:'Same allowed name',creationKey:'synthetic-independent-key',creationFingerprint:'synthetic-canonical-fingerprint'}});
 assert.equal(await db.product.count({where:{name:'Same allowed name'}}),2);assert.equal(await db.product.count({where:{creationKey:null}}),3);
 console.log(JSON.stringify({status:'pass',engine:'PostgreSQL',legacyNullRows:3,legacyDeletedPreserved:true,parallelRequests:12,identityRows:1,sameNameNewIdentityRows:2}));
}finally{await db.$disconnect()}})().catch(error=>{console.error(error);process.exitCode=1});
