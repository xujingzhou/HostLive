
var fs = require('fs');

// don't forget to use your own keys!
var options = {
    key: fs.readFileSync('ssl/key.pem'),
    cert: fs.readFileSync('ssl/cert.pem')
};

// HTTPs server
var app = require('https').createServer(options, function(request, response) {
		if (request.url === '/adapter-latest.js') {
			response.writeHead(200, { 'Content-Type': 'application/javascript' });
			response.end(fs.readFileSync('adapter-latest.js'));
		} else if (request.url === '/broadcast.js') {
			response.writeHead(200, { 'Content-Type': 'application/javascript'  });
			response.end(fs.readFileSync('broadcast.js'));
		} else if (request.url === '/broadcast-ui.js') {
			response.writeHead(200, { 'Content-Type': 'application/javascript'  });
			response.end(fs.readFileSync('broadcast-ui.js'));
		} else if (request.url === '/RTCPeerConnection.js') {
			response.writeHead(200, { 'Content-Type': 'application/javascript'  });
			response.end(fs.readFileSync('RTCPeerConnection.js'));
		} else if (request.url === '/socketio.js') {
			response.writeHead(200, { 'Content-Type': 'application/javascript'  });
			response.end(fs.readFileSync('socketio.js'));
        } else if (request.url === '/getStats.js') {
			response.writeHead(200, { 'Content-Type': 'application/javascript'  });
			response.end(fs.readFileSync('getStats.js'));
        // } else if (request.url === '/systemInfo.js') {
		// 	response.writeHead(200, { 'Content-Type': 'application/javascript'  });
		// 	response.end(fs.readFileSync('systemInfo.js'));
		} else {
			
			response.writeHead(200, {
				'Content-Type': 'text/html'
			});
		   
		    response.end(fs.readFileSync('index.html'));
		}
});


// socket.io goes below
var io = require('socket.io').listen(app, {
    log: true,
    origins: '*:*'
});

io.set('transports', [
    'websocket',
    'xhr-polling',
    'jsonp-polling'
]);

var channels = {};

io.sockets.on('connection', function (socket) {
    var initiatorChannel = '';
    if (!io.isConnected) {
        io.isConnected = true;
    }

    socket.on('new-channel', function (data) {
        if (!channels[data.channel]) {
            initiatorChannel = data.channel;
        }

        channels[data.channel] = data.channel;
        onNewNamespace(data.channel, data.sender);
    });

    socket.on('presence', function (channel) {
        var isChannelPresent = !! channels[channel];
        socket.emit('presence', isChannelPresent);
    });

    socket.on('disconnect', function (channel) {
        if (initiatorChannel) {
            delete channels[initiatorChannel];
        }
		
		console.log('Server io sockets on( connection) -- disconnect ');
    });
});

function onNewNamespace(channel, sender) {
    io.of('/' + channel).on('connection', function (socket) {
        var username;
        if (io.isConnected) {
            io.isConnected = false;
            socket.emit('connect', true);
        }

        socket.on('message', function (data) {
            if (data.sender == sender) {
                if(!username) username = data.data.sender;
                
                socket.broadcast.emit('message', data.data);
            }
			
			console.log('onNewNamespace - message: ' + JSON.stringify(data.data));
        });
        
        socket.on('disconnect', function() {
            if(username) {
				console.log('Server onNewNamespace() -- disconnect username: ' + username);
				
                socket.broadcast.emit('user-left', username);
                username = null;
            }
        });
    });
}

// run app
app.listen(process.env.PORT || 9559);

process.on('unhandledRejection', (reason, promise) => {
  process.exit(1);
});

console.log('Please open SSL URL: https://localhost.com:' + (process.env.PORT || 9559)+'/');
