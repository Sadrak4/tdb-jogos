import { handleHttpApi } from '../server/http-router.js';

export default async function handler(req,res){
  return handleHttpApi(req,res);
}
