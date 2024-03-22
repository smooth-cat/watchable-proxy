const { readFileSync, writeFileSync } = require('fs');
const { promisify } = require('util');
const { execSync, exec } = require('child_process');
const { resolve } = require('path');

const asyncExec = promisify(exec);
const exec1 = (v) => {
  const res = execSync(v, {"encoding": 'utf-8', cwd: process.cwd() });
  console.log(res);
  return res;
};


const CONF = { encoding: 'utf-8' };

/** path */
function readJsonSync(path) {
  const res = JSON.parse(readFileSync(path, CONF));
  return res;
}

function writeJsonSync(path, data) {
  /** 标准两空格缩进 */
  writeFileSync(path, JSON.stringify(data, null, '  '));
}

function changeJsonSync(path, handle) {
  const res = readJsonSync(path);
  const data = handle(res);
  writeJsonSync(path, data);
}

/**
 * 执行环境 +  相对路径
 */
function cwd(path) {
  return resolve(process.cwd(), path);
}

/**
 * 脚本文件 +  相对路径
 * */
function file(path) {
  return resolve(__dirname, path);
}

/** 同步修改文件 */
function changeFileSync(path, handle, shouldAdd=true) {
  const res = readFileSync(path, CONF);
  const data = handle(res);
  writeFileSync(path, data, CONF);
}

module.exports = {
  readJsonSync,
  writeJsonSync,
  changeJsonSync,
  changeFileSync,
  cwd,
  file,
  asyncExec,
  exec: exec1,
};
