var broadcast = function(config) {
    var self = {
        userToken: uniqueToken()
    },
        channels = '--',
        isbroadcaster,
        isGetNewRoom = true,
		participants = 0,
        defaultSocket = { };

    function openDefaultSocket(callback) {
        defaultSocket = config.openSocket({
            onmessage: onDefaultSocketResponse,
            callback: function(socket) {
                defaultSocket = socket;
				callback();
            }
        });
    }

    function onDefaultSocketResponse(response) {
		
        if (response.userToken == self.userToken) return;

        if (isGetNewRoom && response.roomToken && response.broadcaster) config.onRoomFound(response);

        if (response.userToken && response.joinUser == self.userToken && response.participant && channels.indexOf(response.userToken) == -1) {
            channels += response.userToken + '--';
            openSubSocket({
                isofferer: true,
                channel: response.channel || response.userToken,
                closeSocket: true
            });
        }
		
		// console.debug('onDefaultSocketResponse - response: ' + JSON.stringify(response));
		// console.debug('self.userToken: ' + self.userToken);
		// console.debug('isGetNewRoom: ' + isGetNewRoom);
		// console.debug('isbroadcaster: ' + isbroadcaster);
		// console.debug('participants: ' + participants);
		// console.debug('channels: ' + channels);
    }

    function openSubSocket(_config) {
        if (!_config.channel) return;
        var socketConfig = {
            channel: _config.channel,
            onmessage: socketResponse,
            onopen: function() {
                if (isofferer && !peer) initPeer();
            }
        };

        socketConfig.callback = function(_socket) {
            socket = _socket;
            this.onopen();
        };

        var socket = config.openSocket(socketConfig),
            isofferer = _config.isofferer,
            gotstream,
            video = document.createElement('video'),
            inner = { },
            peer;

		video.setAttribute('id', 'remoteVideo_' + _config.channel);
        var peerConfig = {
            attachStream: config.attachStream,
			
			onICEConnectChange: function(iceConnectionState) {
			  if (//iceConnectionState === "failed" ||
				  iceConnectionState === "disconnected" ||
				  iceConnectionState === "closed") {
				
				 if (isofferer) {
					if (config.onNewParticipant) config.onNewParticipant(--participants);
					if (config.onDisconnectParticipant) config.onDisconnectParticipant(_config.channel);
				}
			  }
			  
		      console.debug('peerConfig -- onICEConnectChange: ' + iceConnectionState);
            },
			
            onICE: function(candidate) {
                socket.send({
                    userToken: self.userToken,
                    candidate: {
                        sdpMLineIndex: candidate.sdpMLineIndex,
                        candidate: JSON.stringify(candidate.candidate)
                    }
                });
            },
            onRemoteStream: function(stream) {
                if (!stream) return;

                video.srcObject = stream;
                video.play();

                _config.stream = stream;
                onRemoteStreamStartsFlowing();
            }
        };
        
        function initPeer(offerSDP) {
            if (!offerSDP) {
                peerConfig.onOfferSDP = sendsdp;
            } else {
                peerConfig.offerSDP = offerSDP;
                peerConfig.onAnswerSDP = sendsdp;
            }

            peer = RTCPeerConnection(peerConfig);
        }
        
        function afterRemoteStreamStartedFlowing() {
            gotstream = true;

            config.onRemoteStream({
                video: video,
                stream: _config.stream
            });

            /* closing subsocket here on the offerer side */
            if (_config.closeSocket) socket = null;
        }

        function onRemoteStreamStartsFlowing() {
            if(navigator.userAgent.match(/Android|iPhone|iPad|iPod|BlackBerry|IEMobile/i)) {
                // if mobile device
                return afterRemoteStreamStartedFlowing();
            }
            
            if (!(video.readyState <= HTMLMediaElement.HAVE_CURRENT_DATA || video.paused || video.currentTime <= 0)) {
                afterRemoteStreamStartedFlowing();
            } else setTimeout(onRemoteStreamStartsFlowing, 50);
        }

        function sendsdp(sdp) {
            sdp = JSON.stringify(sdp);
            var part = parseInt(sdp.length / 3);

            var firstPart = sdp.slice(0, part),
                secondPart = sdp.slice(part, sdp.length - 1),
                thirdPart = '';

            if (sdp.length > part + part) {
                secondPart = sdp.slice(part, part + part);
                thirdPart = sdp.slice(part + part, sdp.length);
            }

            socket.send({
                userToken: self.userToken,
                firstPart: firstPart
            });

            socket.send({
                userToken: self.userToken,
                secondPart: secondPart
            });

            socket.send({
                userToken: self.userToken,
                thirdPart: thirdPart
            });
        }

        function socketResponse(response) {
            if (response.userToken == self.userToken) return;
            if (response.firstPart || response.secondPart || response.thirdPart) {
                if (response.firstPart) {
                    inner.firstPart = response.firstPart;
                    if (inner.secondPart && inner.thirdPart) selfInvoker();
                }
                if (response.secondPart) {
                    inner.secondPart = response.secondPart;
                    if (inner.firstPart && inner.thirdPart) selfInvoker();
                }

                if (response.thirdPart) {
                    inner.thirdPart = response.thirdPart;
                    if (inner.firstPart && inner.secondPart) selfInvoker();
                }
            }

            if (response.candidate && !gotstream) {
                peer && peer.addICE({
                    sdpMLineIndex: response.candidate.sdpMLineIndex,
                    candidate: JSON.parse(response.candidate.candidate)
                });
            }
        }

        var STOP_GETSTATS = false;
        var invokedOnce = false;
        function selfInvoker() {
            if (invokedOnce) return;

            invokedOnce = true;

            inner.sdp = JSON.parse(inner.firstPart + inner.secondPart + inner.thirdPart);
            if (isofferer) {
				peer.addAnswerSDP(inner.sdp);
				if (config.onNewParticipant) config.onNewParticipant(++participants);

                var interval = 5000;
                getStats(peer.peer, function(stats) {
                    onGettingWebRTCStats(stats);
                  }, interval);

                // STOP_GETSTATS = true;
			}
            else {
                initPeer(inner.sdp);

                var interval = 5000;
                getStats(peer.peer, function(stats) {
                    onGettingWebRTCStats(stats);
                  }, interval);

                // STOP_GETSTATS = true;
            }
        }

        function onGettingWebRTCStats(stats) {
            if(STOP_GETSTATS) {
                stats.nomore();
                return;
            }
    
            if(stats.connectionType.remote.candidateType.indexOf('relayed') !== -1) {
                stats.connectionType.remote.candidateType = 'TURN';
            }
            else {
                stats.connectionType.remote.candidateType = 'STUN';
            }
        
            if(stats.connectionType.local.candidateType.indexOf('relayed') !== -1) {
                stats.connectionType.local.candidateType = 'TURN';
            }
            else {
                stats.connectionType.local.candidateType = 'STUN';
            }
            
            var statsData = '\n';
            statsData += 'ICE(remoteIceType, localIceType): ' + stats.connectionType.remote.candidateType + ', ' + stats.connectionType.local.candidateType;
            statsData += '\n';
            statsData += 'ExternalIPAddress(remote, local): ' + stats.connectionType.remote.ipAddress + ', ' + stats.connectionType.local.ipAddress;
            statsData += '\n';
            statsData += 'Transport(remote, local): ' + stats.connectionType.remote.transport + ', ' + stats.connectionType.local.transport;
            statsData += '\n';
            
            statsData += 'Encryption: ' + stats.encryption;
            statsData += '\n';
            statsData += 'videoResolutionsForSenders: ' + stats.resolutions.send.width + 'x' + stats.resolutions.send.height;
            statsData += '\n';
            statsData += 'videoResolutionsForReceivers: ' + stats.resolutions.recv.width + 'x' + stats.resolutions.recv.height;
            statsData += '\n';
            statsData += 'codecsSend: ' + stats.audio.send.codecs.concat(stats.video.send.codecs).join(', ');
            statsData += '\n';
            statsData += 'codecsRecv: ' + stats.audio.recv.codecs.concat(stats.video.recv.codecs).join(', ');
            statsData += '\n';
            statsData += 'totalDataForSenders(Audio + Video): ' + bytesToSize(stats.audio.bytesSent + stats.video.bytesSent);
            statsData += '\n';
            statsData += 'totalDataForReceivers(Audio + Video): ' + bytesToSize(stats.audio.bytesReceived + stats.video.bytesReceived);
            statsData += '\n';
            
            statsData += 'Bandwidth: ' + bytesToSize(stats.bandwidth.speed);
            statsData += '\n';
            statsData += 'framerateMean: ' + bytesToSize(stats.video.send.framerateMean);
            statsData += '\n';
            statsData += 'bitrateMean: ' + bytesToSize(stats.video.send.bitrateMean);
            statsData += '\n';
            
            statsData += 'audio-latency: ' + stats.audio.latency + 'ms';
            statsData += '\n';
            statsData += 'video-latency: ' + stats.video.latency + 'ms';
            statsData += '\n';
        
            statsData += 'audio-packetsLost: ' + stats.audio.packetsLost;
            statsData += '\n';
            statsData += 'video-packetsLost: ' + stats.video.packetsLost;
            statsData += '\n';
            
            console.log('statsData = ' + statsData);
        }
        
        function bytesToSize(bytes) {
            var k = 1000;
            var sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
            if (bytes === 0) {
                return '0 Bytes';
            }
            var i = parseInt(Math.floor(Math.log(bytes) / Math.log(k)), 10);
            return (bytes / Math.pow(k, i)).toPrecision(3) + ' ' + sizes[i];
        }
    }

    function startBroadcasting() {
        defaultSocket && defaultSocket.send({
            roomToken: self.roomToken,
            roomName: self.roomName,
            broadcaster: self.userToken
        });
        setTimeout(startBroadcasting, 1000);
    }

    function uniqueToken() {
        var s4 = function() {
            return Math.floor(Math.random() * 0x10000).toString(16);
        };
        return s4() + s4() + "-" + s4() + "-" + s4() + "-" + s4() + "-" + s4() + s4() + s4();
    }

    openDefaultSocket(config.onReady || function() {});
    return {
        createRoom: function(_config) {
            self.roomName = _config.roomName;
            self.roomToken = uniqueToken();

            isbroadcaster = true;
            isGetNewRoom = false;
            startBroadcasting();
			
			console.debug('createRoom - self.roomName: ', self.roomName);
			console.debug('createRoom - isbroadcaster: ' + isbroadcaster);
        },
        joinRoom: function(_config) {
            self.roomToken = _config.roomToken;
            isGetNewRoom = false;
			isbroadcaster = false;

            openSubSocket({
                channel: self.userToken
            });

            defaultSocket.send({
                participant: true,
                userToken: self.userToken,
                joinUser: _config.joinUser
            });
			
			console.debug('createRoom - isbroadcaster: ' + isbroadcaster);
        }
		
    };
};
