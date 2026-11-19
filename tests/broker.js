// Lokale MQTT-server (websocket) voor de tests
const aedes=require('aedes')();const {createServer}=require('aedes-server-factory');
const port=+process.argv[2]||8899;
createServer(aedes,{ws:true}).listen(port,()=>console.log('broker klaar op',port));
