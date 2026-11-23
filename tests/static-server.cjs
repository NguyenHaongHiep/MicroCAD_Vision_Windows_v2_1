const fs=require('node:fs'),path=require('node:path');
// Serve scripts/styles as well as HTML so browser tests exercise the actual application.
module.exports=function staticServer(root,htmlPath=path.join(root,'MicroCAD_Vision.html')){
 return (req,res)=>{
  try{
   const url=new URL(req.url,'http://localhost'),relative=decodeURIComponent(url.pathname);
   const file=relative==='/'?htmlPath:path.resolve(root,'.'+relative);
   if(file!==htmlPath&&!file.startsWith(path.resolve(root)+path.sep)){res.writeHead(403);res.end();return;}
   res.setHeader('Content-Type',({'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png'})[path.extname(file)]||'application/octet-stream');
   res.end(fs.readFileSync(file));
  }catch{res.writeHead(404);res.end();}
 };
};
