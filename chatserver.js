//#!/usr/bin/env node
//
// WebSocket chat server
// Implemented using Node.js
//
// Requires the websocket module.
//
// WebSocket and WebRTC based multi-user chat sample with two-way video
// calling, including use of TURN if applicable or necessary.
//
// This file contains the JavaScript code that implements the server-side
// functionality of the chat system, including user ID management, message
// reflection, and routing of private messages, including support for
// sending through unknown JSON objects to support custom apps and signaling
// for WebRTC.
//
// Requires Node.js and the websocket module (WebSocket-Node):
//
//  - http://nodejs.org/
//  - https://github.com/theturtle32/WebSocket-Node
//
// To read about how this sample works:  http://bit.ly/webrtc-from-chat
//
// Any copyright is dedicated to the Public Domain.
// http://creativecommons.org/publicdomain/zero/1.0/

"use strict";

//require得到基本的web服务器的功能
//require就是加载模块，可以调用模块中的方法
var http = require('http');
var https = require('https');
var fs = require('fs');
const { Stream } = require('stream');
const { resolve } = require('path');
//这个项目是在github上开源的实现，具体的网址见代码上的注释
var WebSocketServer = require('websocket').server;

// Pathnames of the SSL key and certificate files to use for
// HTTPS connections.

const keyFilePath = "/etc/pki/tls/private/mdn-samples.mozilla.org.key";
const certFilePath = "/etc/pki/tls/certs/mdn-samples.mozilla.org.crt";

// Used for managing the text chat user list.

var connectionArray = [];
var nextID = Date.now();
var appendToMakeUnique = 1;

// Output logging information to console

function log(text) {
  var time = new Date();

  console.log("[" + time.toLocaleTimeString() + "] " + text);
}

// If you want to implement support for blocking specific origins, this is
// where you do it. Just return false to refuse WebSocket connections given
// the specified origin.
function originIsAllowed(origin) {
  return true;    // We will accept all connections
}

// Scans the list of users and see if the specified name is unique. If it is,
// return true. Otherwise, returns false. We want all users to have unique
// names.
function isUsernameUnique(name) {
  var isUnique = true;
  var i;

  for (i=0; i<connectionArray.length; i++) {
    if (connectionArray[i].username === name) {
      isUnique = false;
      break;
    }
  }
  return isUnique;
}

// Sends a message (which is already stringified JSON) to a single
// user, given their username. We use this for the WebRTC signaling,
// and we could use it for private text messaging.
function sendToOneUser(target, msgString) {
  var isUnique = true;
  var i;

  for (i=0; i<connectionArray.length; i++) {
    if (connectionArray[i].username === target) {
      connectionArray[i].sendUTF(msgString);
      break;
    }
  }
}

// Scan the list of connections and return the one for the specified
// clientID. Each login gets an ID that doesn't change during the session,
// so it can be tracked across username changes.
function getConnectionForID(id) {
  var connect = null;
  var i;

  for (i=0; i<connectionArray.length; i++) {
    if (connectionArray[i].clientID === id) {
      connect = connectionArray[i];
      break;
    }
  }

  return connect;
}

// Builds a message object of type "userlist" which contains the names of
// all connected users. Used to ramp up newly logged-in users and,
// inefficiently, to handle name change notifications.
function makeUserListMessage() {
  var userListMsg = {
    type: "userlist",
    users: []
  };
  var i;

  // Add the users to the list

  for (i=0; i<connectionArray.length; i++) {
    userListMsg.users.push(connectionArray[i].username);
  }

  return userListMsg;
}

// Sends a "userlist" message to all chat members. This is a cheesy way
// to ensure that every join/drop is reflected everywhere. It would be more
// efficient to send simple join/drop messages to each user, but this is
// good enough for this simple example.
function sendUserListToAll() {
  var userListMsg = makeUserListMessage();
  var userListMsgStr = JSON.stringify(userListMsg);
  var i;

  for (i=0; i<connectionArray.length; i++) {
    connectionArray[i].sendUTF(userListMsgStr);
  }
}


// Try to load the key and certificate files for SSL so we can
// do HTTPS (required for non-local WebRTC).

var httpsOptions = {
  key: null,
  cert: null
};

try {
  httpsOptions.key = fs.readFileSync(keyFilePath);
  try {
    httpsOptions.cert = fs.readFileSync(certFilePath);
  } catch(err) {
    httpsOptions.key = null;
    httpsOptions.cert = null;
  }
} catch(err) {
  httpsOptions.key = null;
  httpsOptions.cert = null;
}

// If we were able to get the key and certificate files, try to
// start up an HTTPS server.

var webServer = null;

//在这个地方先创建了webServer对象
try {
  if (httpsOptions.key && httpsOptions.cert) {
    //使用https（这个刚刚创建的对象）实例化一个运行的web服务器
    //根据选项和处理请求函数创建一个运行的web服务器
    //handleWebRequest就是应对web请求时的处理函数
    webServer = https.createServer(httpsOptions, handleWebRequest);
  }
} catch(err) {
  webServer = null;
}

if (!webServer) {
  try {
    webServer = http.createServer({}, handleWebRequest);
  } catch(err) {
    webServer = null;
    log(`Error attempting to create HTTP(s) server: ${err.toString()}`);
  }
}
//输入文档的目录及名字
function readServerFile(filename)
{
  var res;

  var pro = new Promise(function(resolve,reject){
    fs.readFile(filename,function(error,data)
    {
      if(error){
        log(error);
      } else
      {
        resolve(data);
      }
    }) 
  });
  return pro;
}
//readServerFile("./index.html");
var page = undefined;
var css_chat = undefined;
var js_cc = undefined;
var js_ad = undefined;
var css_shared = undefined;

fs.readFile("./index.html",function(error,data)
{
  if(error){
    log(error);
  } else
  {
    page = data;
  }
}); 

fs.readFile("./chat.css",function(error,data){
  if(error){
    log(error);
  } else{
    css_chat = data;
  }
});
fs.readFile("./chatclient.js",function(error,data){
  if(error){
    log(error);
  } else{
    js_cc = data;
  }
});
fs.readFile("./adapter.js",function(error,data){
  if(error){
    log(error);
  } else{
    js_ad = data;
  }
});
fs.readFile("../shared.css",function(error,data){
  if(error){
    log(error);
  } else{
    css_shared = data;
  }
});
// var stream = fs.createReadStream('/',{flags:'r'});

// Our HTTPS server does nothing but service WebSocket
// connections, so every request just returns 404. Real Web
// requests are handled by the main server on the box. If you
// want to, you can return real HTML here and serve Web content.

//处理web请求的函数
//我们的http服务器什么都没做只有websocket服务器，所以每个连接都会返回404.真正的web请求被处理通过主服务器。如果你想，你可以在此处返回一个真正的HTML页面于此
function handleWebRequest(request, response) {
  log ("Received request for " + request.url);
  log("test");
  switch(request.url)
  {
    case "/":
      response.write(page);
      break;
    case "/chat.css":
      response.write(css_chat);
      break;
    case "/shared.css":
      response.write(css_shared);
      break;
    case "/chatclient.js":
      response.write(js_cc);
      break;
    case "/adapter.js":
      response.write(js_ad);
    default:
      break;
  }

  response.end();
}

// Spin up the HTTPS server on the port assigned to this sample.
// This will be turned into a WebSocket port very shortly.
//让webServer侦听6503端口
webServer.listen(6503, function() {
  log("Server is listening on port 6503");
});

// Create the WebSocket server by converting the HTTPS server into one.
//此处新建一个webSocketServer对象
//由相关知识可知，websocket需要一个http服务器，客户端先通过一个http请求。之后服务器和浏览器之间通过websocket建立起一个双向的tcp通道。
var wsServer = new WebSocketServer({
  //这是刚刚创建的http服务器对象。具体可以看github上相关使用说明
  httpServer: webServer,
  //如果这是真的，无论客户端指定的路径和协议如何，websocket连接都将被接受。
  //接受的协议将是客户要求的第一个协议。任何来源的客户都将被接受。这只应用于最简单的情况。
  //您可能应该将此设置设置为false；并在接受请求对象之前检查其是否可接受
  autoAcceptConnections: false
});

if (!wsServer) {
  log("ERROR: Unable to create WbeSocket server!");
}

// Set up a "connect" message handler on our WebSocket server. This is
// called whenever a user connects to the server's port using the
// WebSocket protocol.

wsServer.on('request', function(request) {
  //如果之前autoAcceptConnections设置成为false，此时一个request事件就会被触发，无论是否一个新的websocket请求出现。
  //你要检查这个请求的协议以及用户源来核对这个连接，之后决定是否接受或者拒绝通过调用webSocketRequest.accept或者reject
  if (!originIsAllowed(request.origin)) {
    request.reject();
    log("Connection from " + request.origin + " rejected.");
    return;
  }

  // Accept the request and get a connection.
  //返回webSocketConnection对象
  //方法的第一个参数为可接受协议？？？？？？这个有点不太懂
  var connection = request.accept("json", request.origin);

  // Add the new connection to our list of connections.

  log("Connection accepted from " + connection.remoteAddress + ".");
  connectionArray.push(connection);

  connection.clientID = nextID;
  nextID++;

  // Send the new client its token; it send back a "username" message to
  // tell us what username they want to use.

  //定义对象msg，类型是id
  var msg = {
    type: "id",
    id: connection.clientID
  };
  //将这个东西发送给客户端，客户端收到类型为id的信息
  //只要有个请求之后，服务器首先就会发送id类型的msg返回给客户端
  connection.sendUTF(JSON.stringify(msg));

  // Set up a handler for the "message" event received over WebSocket. This
  // is a message sent by a client, and may be text to share with other
  // users, a private message (text or signaling) for one user, or a command
  // to the server.

  connection.on('message', function(message) {
    if (message.type === 'utf8') {
      //一旦受到message就会显示出来
      log("Received Message: " + message.utf8Data);

      // Process incoming data.

      var sendToClients = true;
      msg = JSON.parse(message.utf8Data);
      var connect = getConnectionForID(msg.id);

      // Take a look at the incoming object and act on it based
      // on its type. Unknown message types are passed through,
      // since they may be used to implement client-side features.
      // Messages with a "target" property are sent only to a user
      // by that name.

      switch(msg.type) {
        // Public, textual message
        case "message":
          msg.name = connect.username;
          msg.text = msg.text.replace(/(<([^>]+)>)/ig, "");
          break;

        // Username change
        case "username":
          var nameChanged = false;
          var origName = msg.name;

          // Ensure the name is unique by appending a number to it
          // if it's not; keep trying that until it works.
          while (!isUsernameUnique(msg.name)) {
            msg.name = origName + appendToMakeUnique;
            appendToMakeUnique++;
            nameChanged = true;
          }

          // If the name had to be changed, we send a "rejectusername"
          // message back to the user so they know their name has been
          // altered by the server.
          if (nameChanged) {
            var changeMsg = {
              id: msg.id,
              type: "rejectusername",
              name: msg.name
            };
            connect.sendUTF(JSON.stringify(changeMsg));
          }

          // Set this connection's final username and send out the
          // updated user list to all users. Yeah, we're sending a full
          // list instead of just updating. It's horribly inefficient
          // but this is a demo. Don't do this in a real app.
          connect.username = msg.name;
          //把新增的人形成的总名单发送到每个人的浏览器上
          sendUserListToAll();
          sendToClients = false;  // We already sent the proper responses
          break;
      }

      // Convert the revised message back to JSON and send it out
      // to the specified client or all clients, as appropriate. We
      // pass through any messages not specifically handled
      // in the select block above. This allows the clients to
      // exchange signaling and other control objects unimpeded.

      if (sendToClients) {
        var msgString = JSON.stringify(msg);
        var i;

        // If the message specifies a target username, only send the
        // message to them. Otherwise, send it to every user.
        if (msg.target && msg.target !== undefined && msg.target.length !== 0) {
          sendToOneUser(msg.target, msgString);
        } else {
          for (i=0; i<connectionArray.length; i++) {
            connectionArray[i].sendUTF(msgString);
          }
        }
      }
    }
  });

  // Handle the WebSocket "close" event; this means a user has logged off
  // or has been disconnected.
  connection.on('close', function(reason, description) {
    // First, remove the connection from the list of connections.
    connectionArray = connectionArray.filter(function(el, idx, ar) {
      return el.connected;
    });

    // Now send the updated user list. Again, please don't do this in a
    // real application. Your users won't like you very much.
    sendUserListToAll();

    // Build and output log output for close information.

    var logMessage = "Connection closed: " + connection.remoteAddress + " (" +
                     reason;
    if (description !== null && description.length !== 0) {
      logMessage += ": " + description;
    }
    logMessage += ")";
    log(logMessage);
  });
});
