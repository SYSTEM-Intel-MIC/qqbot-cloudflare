#!/usr/bin/env node
import { pbkdf2Sync, randomBytes } from "node:crypto";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
const rl=createInterface({input:stdin,output:stdout});
const password=await rl.question("请输入管理后台密码（至少 12 位）：",{});
rl.close();
if(password.length<12){console.error("密码至少需要 12 位。");process.exit(1);}
const iterations=210000,salt=randomBytes(16);
const hash=pbkdf2Sync(password,salt,iterations,32,"sha256");
console.log("ADMIN_PASSWORD_HASH=pbkdf2$"+iterations+"$"+salt.toString("base64")+"$"+hash.toString("base64"));
