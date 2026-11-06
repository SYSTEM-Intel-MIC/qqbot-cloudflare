#!/usr/bin/env node
import { pbkdf2Sync, randomBytes } from "node:crypto";
import { stdin, stdout } from "node:process";
const chunks=[];
stdin.setEncoding("utf8");
stdout.write("请输入管理后台密码（至少 12 位）：");
stdin.on("data",chunk=>{
 chunks.push(chunk);
 const password=chunks.join("").trim();
 if(!password.includes("\n"))return;
 const value=password.split("\n")[0];
 if(value.length<12){stdout.write("\n密码至少需要 12 位。\n");process.exit(1);}
 const iterations=210000,salt=randomBytes(16);
 const hash=pbkdf2Sync(value,salt,iterations,32,"sha256");
 stdout.write("\nADMIN_PASSWORD_HASH=pbkdf2$"+iterations+"$"+salt.toString("base64")+"$"+hash.toString("base64")+"\n");
 process.exit(0);
});
