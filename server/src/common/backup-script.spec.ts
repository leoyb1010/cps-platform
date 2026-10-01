import { describe, it, expect } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { spawnSync } from 'node:child_process'

describe('backup producer failure safety',()=>{
  it.each([42,0])('pg_dump exit %s: verifies producer before retention and publication',code=>{
    const work=mkdtempSync(join(tmpdir(),'cps-backup-test-'))
    try{
      const bin=join(work,'bin'),out=join(work,'backups with spaces');mkdirSync(bin);mkdirSync(out)
      writeFileSync(join(bin,'pg_dump'),`#!/bin/sh\necho 'synthetic SQL dump'\nexit ${code}\n`,{mode:0o755})
      writeFileSync(join(out,'cps-pg-old.sql.gz'),'known-good-fixture')
      const result=spawnSync('sh',[resolve('scripts/backup-db.sh')],{encoding:'utf8',env:{PATH:`${bin}:/usr/bin:/bin`,DATABASE_PROVIDER:'postgresql',PGDATABASE:'synthetic',BACKUP_DIR:out,BACKUP_KEEP:'1'}})
      const files=readdirSync(out)
      expect(files.filter(f=>f.startsWith('.cps-backup'))).toEqual([])
      if(code){
        expect(result.status).not.toBe(0)
        expect(files).toEqual(['cps-pg-old.sql.gz'])
        expect(readFileSync(join(out,files[0]),'utf8')).toBe('known-good-fixture')
      }else{
        expect(result.status).toBe(0)
        expect(files).toHaveLength(1)
        expect(files[0]).not.toBe('cps-pg-old.sql.gz')
        expect(spawnSync('gzip',['-t',join(out,files[0])]).status).toBe(0)
      }
    }finally{rmSync(work,{recursive:true,force:true})}
  })
})
