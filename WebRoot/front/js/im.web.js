/**
 *	全局变量  
 */
var conn 			  = null;
var currentUserId 	  = null;;
var currentChatUserId = null;
var currentChatType   = null;
var bothRosterArray   = [];
var roomArray         = [];
var rootChatDiv 	  = "chat01";
var chatTitleDivId    = "chatTitle";
var chatMessageDivId  = "chatMessage";
var sending 		  =  false;
var packageCounter    =  0;
var packagePrefix     =  ""; 
var heartBeatId		  =  "";
var sessionKey        =  "";

/**
 *	登录 
 */
var login = function login(){
	setTimeout(function () {
		var username = $("#username").val();
		var password = $("#password").val();
		if(username == ''  || password == ''){
			alert("请输入用户名和密码");
			return;
		}
		hideLogin();	   //隐藏登录界面
		showWaitModalUI(); //显示等待层
		connect(username, password, false);
	}, 50);
};

/**
 * 注册
 */
var regist = function regist(){
	var username = $("#regist_username").val();
	var password = $("#regist_password").val();
	var confirm_password = $("#regist_confirm_password").val();
	if(username == ''  || password == '' || confirm_password == ''){
		alert("请输入用户名和密码");
		return;
	}
	if(password != confirm_password){
		alert("两次输入密码不一致");
		return;
	}
	connect(username, password, true);
};


/**
 * 建立连接
 */
var connect = function connect(username, password,register){
   var objectArgs = {httpbase: BACKEND_SERVER_HTTPBASE};
   if (BACKEND_SERVER_TYPE == 'binding'){
		  conn = new JSJaCHttpBindingConnection(objectArgs);
   }else{
		  conn = new JSJaCHttpPollingConnection(objectArgs);  
   }
   conn.registerHandler('iq', 'query', 'jabber:iq:roster','set', handleIq);
   conn.registerHandler('iq', 'ping', 'urn:xmpp:ping', 'get',handlePing);
   conn.registerHandler('presence',handlePresence);
   conn.registerHandler('message',handleMessage);
   conn.registerHandler('onregister',handleRegister);
   conn.registerHandler('onconnect',handleConnected);
   conn.registerHandler('onerror',handleConnError);
   objectArgs  = {register:register};
   objectArgs.domain    =  SERVER_DOMAIN;
   objectArgs.host      =  SERVER_HOST;
   objectArgs.port  	=  SERVER_PORT;
   objectArgs.resource  =  DEFAULT_RESOURCE;
   objectArgs.username  =  username;
   objectArgs.pass	    =  password;
   conn.connect(objectArgs);
};

/**
 * 重连
 */
var reconnect = function reconnect(){	
	var username = conn.username;
	var password = conn.pass;
	
	//清楚缓存信息
	stopHeartBeat();
	cleanPage();
	connect(username, password, false);
};

/**
 * 申请会话凭证
 */
var applySessionKey  = function applySessionKey(callBack){
	if(conn && conn.connected()){
		var iq  = new JSJaCIQ();
		iq.setID(getUniqueId());
		iq.setType("get");
		iq.setQuery('jabber:iq:expand:user:auth');	
		conn.send(iq, callBack);
	}
};


/**
 * 发送心跳
 */
var sendHeartBeatIQ  = function sendHeartBeatIQ(){
	if(conn && conn.connected()){
		var heartBeatIQ = new JSJaCIQ();
		heartBeatIQ.setID(getUniqueId());
		heartBeatIQ.setTo(SERVER_DOMAIN);
		heartBeatIQ.setType("get");
		var ping = heartBeatIQ.getDoc().createElementNS('urn:xmpp:ping','ping');
		heartBeatIQ.getNode().appendChild(ping);
		conn.send(heartBeatIQ);
	}
};

/**
 * 启动心跳
 */
var startHeartBeat = function startHeartBeat(){
	heartBeatId = setInterval(function () {
       sendHeartBeatIQ();
    }, HEARTBEAT_TIMERVAL * 1000);	
};

/**
 * 停止心跳
 */
var stopHeartBeat = function stopHeartBeat(){
	if(heartBeatId){
		clearInterval(heartBeatId);
	}
};

/**
 * 发送上线请求 
 */
var sendOnlinePresence = function senOnlinePresence(){
	if(conn && conn.connected()){
		var presence = new JSJaCPresence();
		conn.send(presence);
	}
};

/**
 * 进入房间
 */
var sendJoinRoomPresence = function sendJoinRoomPresence(roomId,callBack){
	if(conn && conn.connected()){
		var presence = new JSJaCPresence();
		presence.setTo(roomId +"@"+DEFAULT_CONFERENCE_SERVER +'/'+currentUserId);
		presence.appendNode('x', {'xmlns': 'http://jabber.org/protocol/muc'});
		conn.send(presence,callBack);	
	}
};

/**
 * 离开房间
 */
var sendLeaveRoomPresence = function sendLeaveRoomPresence(roomId){
	if(conn && conn.connected()){
		var presence = new JSJaCPresence();
		presence.setType("unavailable");
		presence.setTo(roomId +"@"+DEFAULT_CONFERENCE_SERVER +'/'+currentUserId);
		conn.send(presence);	
	}
};

/**
 * 登出
 */
var logout = function logout(){
	if(conn && conn.connected()){
		var presence = new JSJaCPresence();
		presence.setType('unavailable');
		conn.send(presence);
		conn.disconnect();
	}
	stopHeartBeat();
	cleanPage();
	hiddenChatUI();
	showLogin();
};

/**
 * 处理好友Iq请求
 */
var handleIq = function handleIq(iq) {
	var queryNode = iq.getQuery();
	if (queryNode) {
		var itemsNode = queryNode.childNodes;
		if (itemsNode) {
			for (var i = 0; i < itemsNode.length; i++) {
				var jid = itemsNode.item(i).getAttribute('jid');
				if (typeof (jid) == 'undefined') {
					continue;
				}
				var userId = jid.split("@")[0];
				var subscription = itemsNode.item(i).getAttribute('subscription');
				if ('both' == subscription || 'from' == subscription) {
					// both表明双方互为好友,from我是对方的单向好友
					addRosterDiv(userId);
				}
				if ('remove' == subscription) {
					removeRosterDiv(userId);
					$('#delFridentModal').modal('hide');
				}
			}
		}
	}
};

/**
 *	服务端心跳(Ping)回复
 */
var handlePing = function handlePing(iq) {
	if (conn && conn.connected()) {
		var resultIQ = new JSJaCIQ();
		resultIQ.setType('result');
		resultIQ.setTo(SERVER_DOMAIN);
		conn.send(resultIQ);
	}
};


/**
 * 处理Presence
 */
var handlePresence = function handlePresence(presence) {
	 var presenceType  = presence.getType();
	 var jid  		   = new JSJaCJID(presence.getFrom());
	 var rosterFlag    = true; //是否为好友相关应答
	 switch (presenceType){
	 	case 'subscribe':
	 		var subscribeMessage = jid.getNode() + "请求加你为好友。";
	 		var status = presence.getStatus();
	 		if(status){
	 			if(status == '[resp:true]'){
	 				return;
	 			}
	 		}
	 		subscribeMessage = subscribeMessage +"<br><br> 验证信息:" + status;
	 		showConfirmMessage(subscribeMessage);
			$('#confirm-block-footer-confirmButton').click(function() {
				agreeAddFriend(jid.getNode());
				$('#confirm-block-div-modal').modal('hide');
			});
			$('#confirm-block-footer-cancelButton').click(function() {
				rejectAddFriend(jid.getNode());
				$('#confirm-block-div-modal').modal('hide');
			});
	 		break;
	 	case 'subscribed':
	 		//好友添加成功,成为对方的好友
	 		break;
	 	case 'unsubscribed':
	 		var status = presence.getStatus();
	 		if(status){
	 			if(status == '[delete]'){
		 			removeRosterDiv(jid.getNode());
		 		}
	 		}
	 		//删除或者拒绝好友服务器响应
	 		$('#delFridentModal').modal('hide');
	 		break;
		default:
			rosterFlag = false;
	      	break;
	 }
	 //群组模块相关应答处理
	 if(!rosterFlag){
		 var x = null;
		 if(presence.getNode().getElementsByTagName('x').length > 0){
			 x = presence.getChild('x','http://jabber.org/protocol/muc#user');
		 }
		 if(x){
			 var item   	 = x.getElementsByTagName('item').item(0);
			 var affiliation = item.getAttribute('affiliation');
			 var role 		 = item.getAttribute('role');
			 var jid         = item.getAttribute('jid');
			 var status 	 = x.getElementsByTagName('status').item(0);
			 var code    	 = null;
			 if(status){
				 code = status.getAttribute('code');
			 }
			 //TODO 业务逻辑有待处理
			 if('none' == affiliation && 'none' == role){
				 if(status){
					 if('301' ==code ){ 
						 //群主解散群
						 $.messager.alert('提示:','群[]已被群主解散','info');
					 }else if('307' == code ){
						 //群主T人
						 var actor = item.getElementsByTagName('actor').item(0);
						 if(actor){
							 $.messager.alert('提示:','您已被管理员移出群[]','info'); 
						 }else{
							 $.messager.alert('提示:','您已成功移除用户'+jid+'','info');
						 }
					 }else if('321' == code){
						 //用户退群
						 var actor = item.getElementsByTagName('actor').item(0);
						 if(actor){
							 $.messager.alert('提示:','您已被退出群[]','info');
						 }else{
							 //忽略其它群成员退出群的状态 
							 //$.messager.alert('提示:',jid+'已被退出群[]','info');
						 }
					 }
				 }else{
					 //群主收到解散通知
					 $.messager.alert('提示:','群[]解散成功','info'); 
				 }
			 }
		 }
	 }
};

/**
 * 注册成功
 */
var handleRegister = function handleRegister(iq){
	if(iq.getType() == 'result'){
		if(iq.getID() == 'reg1'){
			alert("注册成功");
			showLogin();
		}
	}
};

/**
 * 处理Message
 */
var handleMessage = function handleMessage(message) {
	if (message.getType() == 'error') {
		return;
	} else {
		var messageBody = message.getBody();
		var messageType = message.getType();
		if (messageBody != null) {
			var requestElement = message.getChild("request", "urn:xmpp:receipts");
			var ackedElement   = message.getChild("acked", "urn:xmpp:receipts");
			if (requestElement != null || ackedElement != null) {
				sendReceivedMessage(message);
			}
			try {
				var json      = eval("(" + messageBody + ")");
				var bodies    = json.bodies[0],
				  fromUserId  = json["from"],
				    toUserId  = json["to"], 
				 contentType  = bodies["type"], 
				 contentValue = bodies["msg"];
				switch (contentType) {
				case "img":
					appendMessage(fromUserId, toUserId, "[图片]", messageType);
					break;
				case "loc":
					appendMessage(fromUserId, toUserId, "[位置]", messageType);
					break;
				case "audio":
					appendMessage(fromUserId, toUserId, "[语音消息]", messageType);
					break;
				case "video":
					appendMessage(fromUserId, toUserId, "[视频消息]", messageType);
					break;
				case "file":
					appendMessage(fromUserId, toUserId, "[文件]", messageType);
					break;
				case "richtxt":
					appendMessage(fromUserId, toUserId, "[资讯消息]", messageType);
					break;
				case "templatetxt":
					appendMessage(fromUserId, toUserId, "[模板消息]", messageType);
					break;
				case "audio_chat":
					appendMessage(fromUserId, toUserId, "[语音聊天]", messageType);
					break;
				case "video_chat":
					appendMessage(fromUserId, toUserId, "[视频聊天]", messageType);
					break;
				default:
					appendMessage(fromUserId, toUserId, contentValue, messageType);
					break;
				}
			} catch (e) {
				// ignore 不是有效的JSON格式
			}
		}
	}
};

/**
 * 发送文本消息
 */
var sendTextMessage = function sendTextMessage() {
	if (sending) {
		return;
	}
	sending = true;
	var msgElement = document.getElementById(chatMessageDivId);
	var msgValue   = msgElement.value;
	if (msgValue == null || msgValue.length == 0) {
		sending = false;
		return;
	}
	var toUserId = currentChatUserId;
	if (toUserId == null) {
		sending = false;
		return;
	}
	var message = new JSJaCMessage();
	message.setID(getUniqueId());
	message.setType(currentChatType || "chat");
	message.setTo(toUserId + '@' + SERVER_DOMAIN);
	if ("groupchat" == currentChatType) {
		message.setTo(toUserId + '@' + DEFAULT_CONFERENCE_SERVER);
	}
	var json = {
		from   : currentUserId,
		to 	   : toUserId,
		bodies : [ {
				type : "txt",
				 msg : msgValue
			}],
		ext : {}
	};
	message.setBody(JSON.stringify(json));
	message.appendNode('request', {
		xmlns : 'urn:xmpp:receipts',
	});
	conn.send(message);
	appendMessage(currentUserId, toUserId, msgValue);
	
	/* 隐藏表情并清除输入框中相关信息 */
	hideEmotionDiv();
	msgElement.value = "";
	msgElement.focus();
	setTimeout(function() {
		sending = false;
	}, 1000);
};

/**
 * 发现消息回执
 */
var sendReceivedMessage = function(message){
	var receivedMessage = new JSJaCMessage();
	receivedMessage.setTo(SERVER_DOMAIN);
	receivedMessage.setType(message.getType());
	receivedMessage.appendNode('received', {
			xmlns : 'urn:xmpp:receipts',
			id 	  :  message.getID(),
	});
	conn.send(receivedMessage);
};

/**
 * 登录成功
 */
var handleConnected = function handleConnected() {
	
	init();
	// 申请会话凭证
//	applySessionKey(function(resultIQ) {
//		var queryNode = resultIQ.getQuery();
//		if (queryNode) {
//			var childNodes = queryNode.childNodes;
//			if (childNodes != null && childNodes.length > 0) {
//				var content = childNodes[0].textContent;
//				if (content != null && content.length > 0) {
//					var json = eval("(" + content + ")");
//					var errorNo   = json["errorno"], 
//						errorInfo = json["errorinfo"];
//					if ("0" == errorNo) {
//						var bodies = json.bodies[0];
//						sessionKey = bodies["sessionkey"];
//						if (sessionKey != null && sessionKey.length > 0) {
//							init();
//							return;
//						} else {
//							alert("申请会话凭证失败:" + errorInfo);
//						}
//					} else {
//						alert("申请会话凭证失败:" + errorInfo);
//					}
//				}
//
//				// 清除临时缓存数据
//				stopHeartBeat();
//				cleanPage();
//				hiddenChatUI();
//				showLogin();
//			}
//		}
//	});
};

/**
 * 初始化
 */
var init = function init(){
	hiddenWaitModalUI();
	currentUserId = conn.username;
	
	// 查询好友列表
	queryRoster(function(iq) {
		var queryNode = iq.getQuery();
		if (queryNode) {
			var itemsNode = queryNode.childNodes;
			if (itemsNode) {
				for (var i = 0; i < itemsNode.length; i++) {
					var jid = itemsNode.item(i).getAttribute('jid');
					if (typeof (jid) == 'undefined') {
						continue;
					}
					var userId 	     = jid.split("@")[0];
					var subscription = itemsNode.item(i).getAttribute('subscription');
					if ('both' == subscription || 'from' == subscription) {
						// both表明双方互为好友,from我是对方的单向好友
						bothRosterArray.push(userId);
					}

					if ('none' == subscription) {
						// none类型发送remove请求,避免下次收到相关推送
						var iq2 = new JSJaCIQ();
						iq2.setType('set');
						var query2 = iq2.setQuery('jabber:iq:roster');
						var item2  = query2.appendChild(iq2.getDoc().createElement('item'));
						item2.setAttribute('jid', userId + "@" + SERVER_DOMAIN);
						item2.setAttribute('subscription', 'remove');
						conn.send(iq2);
					}
				}
			}
		}
		if (bothRosterArray != null && bothRosterArray.length > 0) {
			buildRosterDiv(bothRosterArray, 'contactlistUL');
			// 隐藏默认文本输入框的显示
			$('#null-nouser').css({
				"display" : "none"
			});
			// 设置第一个联系人为默认联系人
			setRosterChat(bothRosterArray[0]);
		}

		// 查询群组
		queryGroup(function(iq) {
			var queryNode = iq.getQuery();
			if (queryNode) {
				var itemsNode = queryNode.childNodes;
				if (itemsNode) {
					for (var i = 0; i < itemsNode.length; i++) {
						var jid = itemsNode.item(i).getAttribute('jid');
						if (typeof (jid) == 'undefined') {
							continue;
						}
						var roomName = itemsNode.item(i).getAttribute('name');
						var room = {
								 jid : jid,
							  roomId : jid.split("@")[0],
							roomName : roomName
						};
						roomArray.push(room);
					}
				}
			}
			if (roomArray != null && roomArray.length > 0) {
				buildGroupDiv(roomArray, 'grouplistUL');
			}
			sendOnlinePresence();// 发送用户上线请求
			
			if(HEARTBEAT_FLAG){
				startHeartBeat();
			}
		});
	});
	showChatModalUI();
};

/**
 * 登录失败
 */
var handleConnError = function handleConnError(error) {
	  var errorCode  = error.getAttribute('code');
	  var errorType  = error.getAttribute('type');
	  switch (errorCode){
	  	case '401':
	  		alert("用户名或密码错误");
	  		hiddenWaitModalUI();
	  		showLogin();
	  		break;
	  	case '409':
	  		alert("注册失败,用户名已存在！");
	  		break;
	  	case '503':
	  		var status = conn.status();
	  		if("session-terminate-conflict" == status){
	  			if (confirm("您的账号在其它地方登录,是否需要重新登录?")){
	  				reconnect();
	  			}else{
	  				logout();	
	  			}
	  		}else{
	  			alert("服务不可用");
	  			logout();	
	  		}
	  		break;
	  	case '500':
	  		if (!conn.connected()){
	  			if (confirm("服务器内部错误,连接被断开，是否需要重新登录？")){
	  				reconnect();
	  			}else{
	  				logout();
	  			}
	  		}
	  		break;
	  	default:
	  		alert("An Error Occured:\nCode: "+errorCode+"\nType: "+errorType+"\nCondition: "+error.firstChild.nodeName);
	      	break;
	  }
};

/**
 * 查询好友列表
 */
var queryRoster = function(callBack){
	if(conn && conn.connected()){
		var iq = new JSJaCIQ();
		iq.setIQ(null,'get','roster_1');
		iq.setQuery(NS_ROSTER);
		conn.send(iq,callBack);
	}
};

/**
 * 查询已加入的群组 
 */
var queryGroup = function(callBack){
	if(conn && conn.connected()){
		var iq = new JSJaCIQ();
		iq.setIQ(DEFAULT_CONFERENCE_SERVER,'get','disco_item_1');
		iq.setQuery(NS_DISCO_ITEMS);
		conn.send(iq,callBack);	
	}
};

/**
 * 添加好友
 */
var addFriend = function(){
	var friendId = $('#addFridentId').val();
	if (friendId == '') {
		$('#add-frident-warning').html("<font color='#FF0000'>请输入好友名称</font>");
		return;
	}
	if (friendId  == currentUserId){
		$('#add-frident-warning').html("<font color='#FF0000'>不能添加自己为好友</font>");
		return;
	}
	if(validateUserIsFriend(friendId)){
		$('#add-frident-warning').html("<font color='#FF0000'>对方已是您的好友了</font>");
		return;		
	}
	if(conn && conn.connected()){
		var presence = new JSJaCPresence();
		presence.setType('subscribe');
		presence.setTo(friendId +"@"+ SERVER_DOMAIN);
		presence.setStatus("加个好友呗");
		conn.send(presence);
	}
	$('#addFridentModal').modal('hide');
	return;
};

/**
 * 删除好友
 */
var delFriend = function(){
	var friendId = $('#delFridentId').val();
	if (friendId == '') {
		$('#del-frident-warning').html("<font color='#FF0000'>请输入好友名称</font>");
		return;
	}
	if(!validateUserIsFriend(friendId)){
		$('#del-frident-warning').html("<font color='#FF0000'>该用户不是你的好友!</font>");
		return;
	}
	
	if(conn && conn.connected()){
		/*发送删除好友请求*/
		var iq = new JSJaCIQ();
		iq.setType('set');
		var queryNode = iq.setQuery('jabber:iq:roster');
		var itemNode  = queryNode.appendChild(iq.getDoc().createElement('item'));
		itemNode.setAttribute('jid',friendId + "@" + SERVER_DOMAIN);
		itemNode.setAttribute('subscription','remove');
		conn.send(iq);
		
		/*发送删除好友通知*/
		var presence = new JSJaCPresence();
		presence.setType('unsubscribed');
		presence.setTo(friendId +"@"+ SERVER_DOMAIN);
		presence.setStatus("[delete]");
		conn.send(presence);	
	}
};


/**
 * 创建群组
 */
var createGroup  = function createGroup(){
	var groupName = $('#createGroupName').val();
	if (groupName == '') {
		$('#create-group-warning').html("<font color='#FF0000'>请输入群名称</font>");
		return;
	}
	if(conn && conn.connected()){
		//群组唯一编号
		var groupId = Math.uuid().toLowerCase(); 
		var presence = new JSJaCPresence();
		presence.setTo(groupId +"@"+ DEFAULT_CONFERENCE_SERVER +"/" + currentUserId);
		presence.appendNode('x', {'xmlns': 'http://jabber.org/protocol/muc'});
		conn.send(presence);
		
		var iq = new JSJaCIQ();
		iq.setType('set');
		iq.setID("mucroom_create");
		iq.setTo(groupId +"@"+ DEFAULT_CONFERENCE_SERVER);
		var queryNode = iq.setQuery('http://jabber.org/protocol/muc#owner');
		var xNode 	  = queryNode.appendChild(iq.buildNode('x', {'xmlns': 'jabber:x:data', 'type': 'submit'}));

		//设置持久化属性
		var persistentField  = xNode.appendChild(iq.buildNode('field'));
		persistentField.setAttribute('var','muc#roomconfig_persistentroom');
		persistentField.setAttribute('type','boolean');
		var persistentFieldValue = persistentField.appendChild(iq.getDoc().createElement('value'));
		persistentFieldValue.textContent = "1";
		
		//设置群主属性
		var ownerField  = xNode.appendChild(iq.buildNode('field'));
		ownerField.setAttribute('var','muc#roomconfig_roomowners');
		ownerField.setAttribute('type','jid-multi');
		var ownerFieldValue = ownerField.appendChild(iq.getDoc().createElement('value'));
		ownerFieldValue.textContent = currentUserId + "@" + SERVER_DOMAIN;
		
		//设置群名称
		var groupNameField  = xNode.appendChild(iq.buildNode('field'));
		groupNameField.setAttribute('var','muc#roomconfig_roomname');
		groupNameField.setAttribute('type','text-single');
		var groupNameFieldValue = groupNameField.appendChild(iq.getDoc().createElement('value'));
		groupNameFieldValue.textContent = groupName;
		
		//设置群描述
		var groupDescField  = xNode.appendChild(iq.buildNode('field'));
		groupDescField.setAttribute('var','muc#roomconfig_roomdesc');
		groupDescField.setAttribute('type','text-single');
		var groupDescFieldValue = groupDescField.appendChild(iq.getDoc().createElement('value'));
		groupDescFieldValue.textContent = "";
		
		//设置是否公开
		var publicField  = xNode.appendChild(iq.buildNode('field'));
		publicField.setAttribute('var','muc#roomconfig_publicroom');
		publicField.setAttribute('type','boolean');
		var publicFieldValue = publicField.appendChild(iq.getDoc().createElement('value'));
		publicFieldValue.textContent = "1";
		
		//设置群头像
		var groupAvatarField  = xNode.appendChild(iq.buildNode('field'));
		groupAvatarField.setAttribute('var','muc#roomconfig_roomavatar');
		groupAvatarField.setAttribute('type','text-single');
		var groupAvatarFieldValue = groupAvatarField.appendChild(iq.getDoc().createElement('value'));
		groupAvatarFieldValue.textContent = "";
		
		conn.send(iq,function(resultIQ){
			if(resultIQ.getType() == 'result'){
				if(iq.getID() == 'mucroom_create'){
					//添加群组到对应节点,可以重新拉取数据或者手动添加
					var room = {
							 jid : iq.getTo(),
						  roomId : groupId,
						roomName : groupName
					};
					roomArray.push(room);
					var tempRoomArray = [];
					tempRoomArray.push(room);
					buildGroupDiv(tempRoomArray, 'grouplistUL',true);
				}
			}
		});
	}
	$('#createGroupModal').modal('hide');
	return;
};

/**
 * HTTP接口-查询群组详细信息
 * @groupId  群组编号
 * @operType 操作类型  退群 quit,添加群成员 add
 */
var queryGroupInfo = function queryGroupInfo(groupId,operType){
	var param = {'funcNo':'1003019','sessionkey':sessionKey,'username':currentUserId,'id':groupId};
	$.ajax({   
        type: 'POST',   
        dataType : 'json',  
        url: BUSINESS_SERVER_URL,   
        data: param,   
        beforeSend: ajaxLoadingShow("请稍后。。。"),  
		success: function(data){
			ajaxLoadingHide();  
            var errorNo	  = data.error_no;
            var errorInfo = data.error_info;
            if("0" == errorNo){
            	var results = data.results;
            	if(results !=null && results.length > 0){
            		var groupInfo  = results[0];
            		switch (operType) {
					case 'quit':
						var owner  = groupInfo.owner;
						var name   = groupInfo.name;
						if(currentUserId == owner){
							//群主解散群
							$.messager.confirm("提示", "您确定要解散群'"+name+"'吗？", function (data) {
					            if(data){
					            	destoryGroup(groupId);
					            }
					        });
						}else{
							//群成员退出群
							$.messager.confirm("提示", "您确定要退出群'"+name+"'吗？", function (data) {
					            if(data){
					            	quitGroup(groupId);
					            }
					        });
						}
						break;
					case 'add':
						var owner  = groupInfo.owner;
						if(currentUserId == owner){
							showAddUserDiv();
						}else{
							showInviteUserDiv();
						}
						break;	
					case 'del':
						var owner   = groupInfo.owner;
						if(currentUserId == owner){
							queryGroupMemberInfo(groupId,true);
						}else{
							queryGroupMemberInfo(groupId,false);
						}
						break;	
					default:
						break;
					}
            	}
            }else{
            	$.messager.alert('提示:',errorInfo,'error'); 
            }
        },
        error:function(){
        	ajaxLoadingHide();
        	$.messager.alert('提示:','调用失败','error'); 
        }
    });
};

/**
 * HTTP接口-查询群成员信息
 * @groupId  群组编号
 * @owner    是否群主
 */
var queryGroupMemberInfo = function queryGroupMemberInfo(groupId,owner){
	var param = {'funcNo':'1003036','sessionkey':sessionKey,'id':groupId};
	$.ajax({   
        type: 'POST',   
        dataType : 'json',  
        url: BUSINESS_SERVER_URL,   
        data: param,   
        beforeSend: ajaxLoadingShow("请稍后。。。"),  
		success: function(data){
			ajaxLoadingHide();  
            var errorNo	  = data.error_no;
            var errorInfo = data.error_info;
            if("0" == errorNo){
            	var results = data.results;
            	if(results !=null && results.length > 0){
            		var members = results[0].data;
            		
            		//展示群成员信息
            		$("#group-div-modal").html("");
            		for(var i = 0; i < members.length; i++){
            			if(owner && i == 0){
            				$('#group-div-modal').append("<p>"+members[i].username+"</p>");
            			}else{
            				if(owner){
            					$('#group-div-modal').append("<p>"+members[i].username+
            						"<a style='float:right;' onclick=delGroupMember('"+currentChatUserId+"','"+members[i].username+"')>删除</a>" +		
            					"</p>");
            				}else{
            					$('#group-div-modal').append("<p>"+members[i].username+"</p>");
            				}
            			}
            		}
            		$('#option-group-div-modal').modal('toggle');
            	}
            }else{
            	$.messager.alert('提示:',errorInfo,'error'); 
            }
        },
        error:function(){
        	ajaxLoadingHide();
        	$.messager.alert('提示:','调用失败','error'); 
        }
    });
};

/**
 *	解散群 
 */
var destoryGroup = function destoryGroup(groupId){
	if(conn && conn.connected()){
		var iq = new JSJaCIQ();
	    iq.setType('set');
	    iq.setTo(groupId +"@"+ DEFAULT_CONFERENCE_SERVER);
	    var query = iq.setQuery('http://jabber.org/protocol/muc#owner');
	    query.appendChild(iq.getDoc().createElement('destroy'));
	    conn.send(iq);
	}
};

/**
 *	退出群 
 */
var quitGroup = function quitGroup(groupId){
	if(conn && conn.connected()){
		var iq = new JSJaCIQ();
	    iq.setType('set');
	    iq.setTo(groupId +"@"+ DEFAULT_CONFERENCE_SERVER);
	    var query = iq.setQuery('http://jabber.org/protocol/muc#admin');
		var item  = query.appendChild(iq.getDoc().createElement('item'));
		item.setAttribute('affiliation', 'none');
		item.setAttribute('jid', currentUserId + "@" + SERVER_DOMAIN);
		conn.send(iq);
	}
};

/**
 * 群主T人
 */
var delGroupMember = function delGroupMember(groupId,userId){
	if(conn && conn.connected()){
		var iq = new JSJaCIQ();
	    iq.setType('set');
	    iq.setTo(groupId +"@"+ DEFAULT_CONFERENCE_SERVER);
	    var query = iq.setQuery('http://jabber.org/protocol/muc#admin');
		var item  = query.appendChild(iq.getDoc().createElement('item'));
		item.setAttribute('affiliation', 'none');
		item.setAttribute('jid', userId + "@" + SERVER_DOMAIN);
		conn.send(iq);
	}
};

/**
 *	群主添加群成员
 *  根据具体业务场景进行编写,群主是可以直接添加用户到群,也可以通过邀请的方式让用户自助选择是否进入群 
 */
var addGroupMember = function addGroupMember(groupId,userId){
	if(conn && conn.connected()){
		var iq  = new JSJaCIQ();
		iq.setType("set");
		iq.setID(getUniqueId());
	    var query = iq.setQuery('jabber:iq:expand:muc:member:add');
		var body  = query.appendChild(iq.getDoc().createElement('body'));
		var json  = {"users": [userId],"roomId": groupId};
		body.textContent = JSON.stringify(json);
		conn.send(iq, function(resultIQ){
			var queryNode = resultIQ.getQuery();
			if (queryNode) {
				var childNodes = queryNode.childNodes;
				if (childNodes != null && childNodes.length > 0) {
					var content = childNodes[0].textContent;
					if (content != null && content.length > 0) {
						var json = eval("(" + content + ")");
						var errorNo   = json["errorno"], 
							errorInfo = json["errorinfo"];
						if("0" == errorNo){
							 $.messager.alert('提示:',errorInfo,'info');
						}else {
							 $.messager.alert('提示:',errorInfo,'info');
						}
					}
				}
			}
		});
	}
};

/**
 * 邀请用户加入群组
 */
var inviteUserAddGroup = function inviteUserAddGroup(groupId,userId){
	if(conn && conn.connected()){
		var message  = new JSJaCMessage();
		message.setID(getUniqueId());
		var xNode  		= message.getNode().appendChild(message.getDoc().createElementNS('http://jabber.org/protocol/muc#owner','x'));
		var inviteNode  = xNode.appendChild(message.buildNode('invite', {'to': userId + "@" + SERVER_DOMAIN}));
		var reasonNode  = inviteNode.appendChild(message.buildNode('reason'));
		var json = {"roomName":"", "roomId":groupId,"reason":"",'roomJid':groupId +"@"+DEFAULT_CONFERENCE_SERVER};
		reasonNode.textContent = JSON.stringify(json);
		conn.send(message);
	}
};

/**
 * 同意添加好友
 */
var agreeAddFriend = function agreeAddFriend(friendId) {
	if(conn && conn.connected()){
		//发送同意申请
		var subscribedPresence = new JSJaCPresence();
		subscribedPresence.setType('subscribed');
		subscribedPresence.setTo(friendId +"@"+ SERVER_DOMAIN);
		conn.send(subscribedPresence);
		
		//发送自动加好友申请
		var subscribePresence = new JSJaCPresence();
		subscribePresence.setType('subscribe');
		subscribePresence.setTo(friendId +"@"+ SERVER_DOMAIN);
		subscribePresence.setStatus("[resp:true]");
		conn.send(subscribePresence); 
	}
};

/**
 * 拒绝添加好友
 */
var rejectAddFriend = function(friendId) {
	if(conn && conn.connected()){
		var unsubscribedPresence = new JSJaCPresence();
		unsubscribedPresence.setType('unsubscribed');
		unsubscribedPresence.setTo(friendId +"@"+ SERVER_DOMAIN);
		conn.send(unsubscribedPresence);
	}
};

/**
 * 根据用户ID判断用户是否是好友
 */
var validateUserIsFriend = function(userId) {
	if(bothRosterArray){
		for (var i = 0; i < bothRosterArray.length; i++) {
			if (bothRosterArray[i] == userId) {
				return true;
			}
		}	
	}
	return false;
};

/**
 * 从好友列表删除好友
 */
var  removeRosterDiv = function(friendId){
	if(validateUserIsFriend(friendId)){
		bothRosterArray.remove(friendId);
		//删除好友列表
		var liElement  = getChatLi(friendId);
		if(liElement){
			liElement.remove();
		}
		
		//删除好友对话框
		var divElement = getChatDiv(friendId);
		if(divElement){
			divElement.remove();
		}
		
		if(currentChatUserId == friendId){
			if(bothRosterArray.length > 0){
				//设置第一个联系人为默认联系人
				setRosterChat(bothRosterArray[0]);	
			}else{
				//没有好友了,恢复默认
				currentChatUserId = "";
				currentChatType   = "";
				document.getElementById(chatTitleDivId).children[0].innerHTML = "";
				$('#null-nouser').css({
					"display" : "block"
				});
			}
		}
	}
};

/**
 * 向好友列表中添加好友
 */
var addRosterDiv = function(friendId) {
	if (!validateUserIsFriend(friendId)) {
		bothRosterArray.push(friendId);
		// 增加用户至好友列表
		var liElement = getChatLi(friendId);
		if (!liElement) {
			liElement = $('<li>').attr({
					  'id' : 'chat_' + friendId,
					'type' : 'chat'
			}).click(function() {
				chooseContactChat(this);
			});
			liElement.css("margin", "5px");
			$('<img>').attr("src", "front/img/head/default_friend.png").attr("width", "35")
					  .attr("height", "35").appendTo(liElement);
			$('<span>').css("margin-left", "10px").html(friendId).appendTo(liElement);
			$('#contactlistUL').append(liElement);

			// 如果以前没有好友第一次添加,设置为默认联系人
			if (bothRosterArray.length == 1) {
				$('#null-nouser').css({
					"display" : "none"
				});
				setRosterChat(bothRosterArray[0]);
			}
		}
	}
};

/**
 * 构造花名册(好友)列表
 */
var buildRosterDiv = function buildRosterDiv(rosterArray, divId) {
	$('#' + divId).html("");
	for (var i = 0; i < rosterArray.length; i++) {
		var liElement = $('<li>').attr({
				  'id' : 'chat_' + rosterArray[i],
				'type' : 'chat'
		}).click(function() {
			chooseContactChat(this);
		});
		liElement.css("margin", "5px");
		$('<img>').attr("src", "front/img/head/default_friend.png").attr("width", "35")
				.attr("height", "35").appendTo(liElement);
		$('<span>').css("margin-left", "10px").html(rosterArray[i]).appendTo(liElement);
		$('#' + divId).append(liElement);
	}
};

/**
 * 构造群组列表
 * @groupArray 群组列表
 * @divId	   节点编号
 * @append     是否追加到元素尾部
 */
var buildGroupDiv = function buildGroupDiv(groupArray, divId, append) {
	if(!append){
		$('#' + divId).html("");	
	}
	for (var i = 0; i < groupArray.length; i++) {
		var liElement = $('<li>').attr({
					 'id' : 'groupchat_' + groupArray[i].roomId,
				   'type' : 'groupchat',
			'displayname' :  groupArray[i].roomName,
			     'joined' : 'false'
		}).click(function() {
			chooseContactChat(this);
		});
		liElement.css("margin", "5px");
		$('<img>').attr("src", "front/img/head/default_group.png").attr("width", "35")
				  .attr("height", "35")
				  .appendTo(liElement);
		$('<span>').css("margin-left", "10px").html(groupArray[i].roomName).appendTo(liElement);
		$('#' + divId).append(liElement);
	}
};

/**
 * 选择好友聊天
 */
var chooseContactChat = function chooseContactChat(li){
	var chatType   = $(li).attr("type");
	var chatUserId = "";
	if("groupchat" == chatType){
		chatUserId = li.id.substring("groupchat".length + 1);
	}else{
		chatUserId = li.id.substring("chat".length + 1);
	}
	if(currentChatUserId == null || currentChatUserId.length <=0){
		//隐藏默认文本输入框的显示
		$('#null-nouser').css({
			"display" : "none"
		});
	}
	if(chatUserId != currentChatUserId){
		if(currentChatUserId == null){
			showChatDiv(chatUserId,chatType);
		}else{
			showChatDiv(chatUserId,chatType);
			hideChatDiv(currentChatUserId,currentChatType);
		}
		currentChatUserId = chatUserId;
		currentChatType   = chatType;
	}
};


/**
 * 设置聊天好友
 */
var setRosterChat = function setRosterChat(chatUserId) {
	if (chatUserId != currentChatUserId) {
		if (currentChatUserId == null) {
			showChatDiv(chatUserId);
		} else {
			showChatDiv(chatUserId);
			hideChatDiv(currentChatUserId);
		}
		currentChatUserId = chatUserId;
		currentChatType   = "chat";
	}
};

/**
 * 注册页面-点击返回按钮
 */
var showLogin = function showLogin() {
	$('#im-div-regeist').modal('hide');
	$('#im-div-login').modal('toggle');
};

/**
 * 登录页面-点击注册按钮
 */
var showRegist = function showRegist() {
	$('#im-div-login').modal('hide');
	$('#im-div-regeist').modal('toggle');
};

/**
 * 隐藏登录界面
 */
var hideLogin = function hideLogin() {
	$('#im-div-login').modal('hide');
};

/**
 * 显示等待层
 */
var showWaitModalUI = function() {
	$('#waitmodal').modal('show');
};

/**
 * 隐藏等待层
 */
var hiddenWaitModalUI = function() {
	$('#waitmodal').modal('hide');
};

/**
 * 显示聊天界面
 */
var showChatModalUI = function() {
	$('#content').css({
		"display" : "block"
	});
	var loginUser = document.getElementById("login_user");
	loginUser.innerHTML = currentUserId;
};

/**
 * 隐藏聊天界面
 */
var hiddenChatUI = function() {
	$('#content').css({
		"display" : "none"
	});
};

/**
 * 显示聊天界面
 * 选择联系人之后：修改联系人背景色,创建对话框
 */
var showChatDiv = function(chatUserId,chatType){
	var chatDiv = getChatDiv(chatUserId);
	if (chatDiv == null) {
		chatDiv = createChatDiv(chatUserId);
		document.getElementById(rootChatDiv).appendChild(chatDiv);
	}
	chatDiv.style.display = "block";
	var liElement = null;
	if (chatType && "groupchat" == chatType) {
		liElement = document.getElementById('groupchat_' + chatUserId);
		if (liElement == null) {
			return;
		}
		if ("groupchat" == $(liElement).attr("type") && 'true' != $(liElement).attr("joined")) {
			//点击群组时如果没有发送过join请求时发送
			sendJoinRoomPresence(chatUserId, function() {
				$(liElement).attr("joined", "true");
			});
		}
	} else {
		liElement = document.getElementById('chat_' + chatUserId);
		if (liElement == null) {
			return;
		}
	}
	liElement.style.backgroundColor = "#33CCFF";
	
	//清除未读消息提醒 
	var spanElement = $(liElement).children(".badge");
	if (spanElement && spanElement.length > 0) {
		liElement.removeChild(liElement.children[2]);
	}
	//点击有未读消息对象时对未读消息提醒的处理
	var badgeGroup = $(liElement).parent().parent().parent().find(".badge");
	if (badgeGroup && badgeGroup.length == 0) {
		$(liElement).parent().parent().parent().prev().children().children().remove();
	}
	//设置聊天窗口显示当前对话人信息
	var chatTitle = "";
	if ("groupchat" == chatType) {
		chatTitle = "与群组" + $(liElement).attr('displayname') + "聊天中";
		$("#roomMember").css('display', 'block');
	} else {
		chatTitle = "与" + chatUserId + "聊天中";
		$("#roomMember").css('display', 'none');
	}
	document.getElementById(chatTitleDivId).children[0].innerHTML = chatTitle;
};

/**
 * 隐藏聊天界面
 */
var hideChatDiv = function(chatUserId,chatType){
	var liElement = null;
	if(chatType  && "groupchat" == chatType){
		liElement = document.getElementById('groupchat_' + chatUserId);	
	}else{
		liElement = document.getElementById('chat_' + chatUserId);
	}
	if (liElement) {
		liElement.style.backgroundColor = "";
	}
	var chatDiv = getChatDiv(chatUserId);
	if (chatDiv) {
		chatDiv.style.display = "none";
	}
};

/**
 * 查询好友Li
 */
var getChatLi = function(chatUserId, chatType) {
	if (chatType && "groupchat" == chatType) {
		return document.getElementById("groupchat_" + chatUserId);
	} else {
		return document.getElementById("chat_" + chatUserId);
	}
};

/**
 * 查询聊天Div
 */
var getChatDiv = function(chatUserId) {
	return document.getElementById(currentUserId + "-" + chatUserId);
};

/**
 * 如果与当前联系人没有聊天窗口Div就创建一个
 */
var createChatDiv = function(chatUserId) {
	var chatDivId = currentUserId + "-" + chatUserId;
	var chatDiv   = document.createElement("div");
	$(chatDiv).attr({
		"id" 		: chatDivId,
		"class" 	: "chat01_content",
		"className" : "chat01_content",
		"style" 	: "display:none"
	});
	return chatDiv;
};


/**
 * 聊天记录展示
 * @param fromUserId  发送人用户Id
 * @param toUserId	  接收人用户Id
 * @param msg		  消息内容	
 * @param chatType	  消息类型
 */
var appendMessage = function(fromUserId, toUserId, msg, chatType){
	if (currentUserId == fromUserId) {
		// 发送消息
		var divElement = $("<div>" + "<p1>" + fromUserId + "&nbsp;&nbsp;</p1>" + "<p2>" + getLoacalTimeString() + "<br/></p2>" + "</div>");
		var message = $("<p3>" + formatEmotion(msg) + "</p3>");
		message.attr("class", "chat-content-p3");
		message.attr("className", "chat-content-p3");
		divElement.append(message);
		divElement.css("text-align", "right");

		var chatDiv = getChatDiv(toUserId);
		if (chatDiv == null) {
			chatDiv = createChatDiv(toUserId);
			document.getElementById(rootChatDiv).appendChild(chatDiv);
		}
		$('#' + currentUserId + "-" + toUserId).append(divElement);
		$('#' + currentUserId + "-" + toUserId).scrollTop($('#' + currentUserId + "-" + toUserId)[0].scrollHeight);
	} else {
		// 接收消息
		var divElement = $("<div>" + "<p1>" + fromUserId + "&nbsp;&nbsp;</p1>" + "<p2>" + getLoacalTimeString() + "<br/></p2>" + "</div>");
		var message = $("<p3>" + formatEmotion(msg) + "</p3>");
		message.attr("class", "chat-content-p3");
		message.attr("className", "chat-content-p3");
		divElement.append(message);
		divElement.css("text-align", "left");

		// 收到消息
		if (chatType && "groupchat" == chatType) {
			fromUserId = toUserId;
		}
		var liElement = getChatLi(fromUserId, chatType);
		if (liElement == null) {
			/* TODO-陌生人 */
		}
		divElement.css("text-align", "left");

		// 如果非当前聊天用户,收到信息增加未读消息条数显示
		if (currentChatUserId != fromUserId) {
			liElement.style.backgroundColor = "green";
			var spanElement = $(liElement).children(".badge");
			if (spanElement && spanElement.length > 0) {
				var badgeValue  = spanElement.text();
				var badgeNumber = new Number(badgeValue);
				badgeNumber++;
				spanElement.text(badgeNumber);
			} else {
				$(liElement).append('<span class="badge">1</span>');
			}
			// 增加不同分组消息提醒
			var badgeGroup = $(liElement).parent().parent().parent().prev().children().children(".badgegroup");
			if (badgeGroup && badgeGroup.length == 0) {
				$(liElement).parent().parent().parent().prev().children().append('<span class="badgegroup">New</span>');
			}
		}
		var chatDiv = getChatDiv(fromUserId);
		if (chatDiv == null) {
			chatDiv = createChatDiv(fromUserId);
			document.getElementById(rootChatDiv).appendChild(chatDiv);
		}
		$('#' + currentUserId + "-" + fromUserId).append(divElement);
		$('#' + currentUserId + "-" + fromUserId).scrollTop($('#' + currentUserId + "-" + fromUserId)[0].scrollHeight);
	}
};

/**
 * 显示添加好友界面
 */
var showAddFriend = function() {
	$('#addFridentModal').modal('toggle');
	$('#addFridentId').val('好友账号');//输入好友账号
	$('#add-frident-warning').html("");
};

/**
 * 显示删除好友界面
 */
var showDelFriend = function() {
	$('#delFridentModal').modal('toggle');
	$('#delFridentId').val('好友账号');//输入好友账号
	$('#del-frident-warning').html("");
};

/**
 * 显示创建群组界面
 */
var showCreateGroup = function() {
	$('#createGroupModal').modal('toggle');
	$('#createGroupName').val('群名称');//输入群名称
	$('#create-group-warning').html("");
};

/**
 * 清除输入框内容
 */
var clearInputValue = function(inputId) {
	$('#' + inputId).val('');
};
/**
 * 清空聊天记录
 */
var cleanChatLog = function() {
	if (confirm("确定要清楚聊天记录?")) {
		var divElement = getChatDiv(currentChatUserId) || createChatDiv(currentChatUserId);
		divElement.innerHTML = "";
	}
};

// 消息通知操作时调用的方法
var showConfirmMessage = function(message) {
	$('#confirm-block-div-modal').modal('toggle');
	$('#confirm-block-footer-body').html(message);
};

/**
 * 清理页面临时缓存
 */
var cleanPage = function (){
	//重新初始化全局变量
	conn 		  	  = null;
	currentUserId 	  = null;;
	currentChatUserId = null;
	currentChatType   = null;
	bothRosterArray   = [];
	roomArray         = [];
	sending 		  = false;
	packageCounter    = 0;
	packagePrefix     = "";
	
	//清除右侧聊天对话框
	document.getElementById(chatTitleDivId).children[0].innerHTML = "";
	var messageRootElement     = document.getElementById(rootChatDiv);
	var messageChildrenElement = messageRootElement.children;
	for (var i = messageChildrenElement.length - 1; i > 1; i--) {
		messageRootElement.removeChild(messageChildrenElement[i]);
	}
	$('#null-nouser').css({
		"display" : "block"
	});
};

/**
 * 显示常用表情界面
 */
var emotionFlag    = false;
var showEmotionDiv = function showEmotionDiv() {
	if (emotionFlag) {
		$('#chat_emotion_div').css({
			"display" : "block"
		});
		return;
	}
	emotionFlag = true;
	for(var i = 0 ; i < IM_EMOTIONS.length; i++){
		var emotions = $('<img>').attr({
			"id" 	:  IM_EMOTIONS[i].id,
			"src"	:  IM_EMOTIONS[i].url,
			"title"	:  IM_EMOTIONS[i].title,
			"style" :  "cursor:pointer"
		}).click(function() {
			selectEmotion(this);
		});
		$('<li>').append(emotions).appendTo($('#emotion_ul'));
	}
	$('#chat_emotion_div').css({
		"display" : "block"
	});
};

/**
 * 	字符串转表情
 */
var formatEmotion = function formatEmotion(str){
	for(var i = 0 ; i < IM_EMOTIONS.length; i++){
		if(str.indexOf(IM_EMOTIONS[i].id) >= 0){
			str = str.replaceAll(IM_EMOTIONS[i].id, '<p3><img src="'+IM_EMOTIONS[i].url+'" width="22px" height="22px"/></p3>');
		}
	}
	return str;
};

/**
 * 选择表情
 */
var selectEmotion  = function selectEmotion(li){
	var textarea   = document.getElementById(chatMessageDivId);
	textarea.value = textarea.value + li.id;
	textarea.focus();
};

/**
 * 隐藏常用表情界面
 */
var hideEmotionDiv = function hideEmotionDiv() {
	$("#chat_emotion_div").fadeOut("slow");
};

/**
 * 聊天表情
 */
var IM_EMOTIONS = [
   {"id":"[@emoji_1.gif]","title":"偷笑","url":"front/img/emoticons/emoji_1.png"},
   {"id":"[@emoji_2.gif]","title":"白眼","url":"front/img/emoticons/emoji_2.png"},
   {"id":"[@emoji_3.gif]","title":"握手","url":"front/img/emoticons/emoji_3.png"},
   {"id":"[@emoji_4.gif]","title":"西瓜","url":"front/img/emoticons/emoji_4.png"},
   {"id":"[@emoji_5.gif]","title":"衰","url":"front/img/emoticons/emoji_5.png"},
   {"id":"[@emoji_6.gif]","title":"眨眼","url":"front/img/emoticons/emoji_6.png"},
   {"id":"[@emoji_7.gif]","title":"流泪","url":"front/img/emoticons/emoji_7.png"},
   {"id":"[@emoji_8.gif]","title":"夜晚","url":"front/img/emoticons/emoji_8.png"},
   {"id":"[@emoji_9.gif]","title":"赞","url":"front/img/emoticons/emoji_9.png"},
   {"id":"[@emoji_10.gif]","title":"得意","url":"front/img/emoticons/emoji_10.png"},
   {"id":"[@emoji_11.gif]","title":"再见","url":"front/img/emoticons/emoji_11.png"},
   {"id":"[@emoji_12.gif]","title":"汗","url":"front/img/emoticons/emoji_12.png"},
   {"id":"[@emoji_13.gif]","title":"惊讶","url":"front/img/emoticons/emoji_13.png"},
   {"id":"[@emoji_14.gif]","title":"吃饭","url":"front/img/emoticons/emoji_14.png"},
   {"id":"[@emoji_15.gif]","title":"奋斗","url":"front/img/emoticons/emoji_15.png"},
   {"id":"[@emoji_16.gif]","title":"饿了","url":"front/img/emoticons/emoji_16.png"},
   {"id":"[@emoji_17.gif]","title":"胜利","url":"front/img/emoticons/emoji_17.png"},
   {"id":"[@emoji_18.gif]","title":"哈欠","url":"front/img/emoticons/emoji_18.png"},
   {"id":"[@emoji_19.gif]","title":"睡着","url":"front/img/emoticons/emoji_19.png"},
   {"id":"[@emoji_20.gif]","title":"右哼哼","url":"front/img/emoticons/emoji_20.png"},
   {"id":"[@emoji_21.gif]","title":"害羞","url":"front/img/emoticons/emoji_21.png"},
   {"id":"[@emoji_22.gif]","title":"鄙视","url":"front/img/emoticons/emoji_22.png"},
   {"id":"[@emoji_23.gif]","title":"疑问","url":"front/img/emoticons/emoji_23.png"},
   {"id":"[@emoji_24.gif]","title":"委屈","url":"front/img/emoticons/emoji_24.png"},
   {"id":"[@emoji_25.gif]","title":"咖啡","url":"front/img/emoticons/emoji_25.png"},
   {"id":"[@emoji_26.gif]","title":"鲜花","url":"front/img/emoticons/emoji_26.png"},
   {"id":"[@emoji_27.gif]","title":"啤酒","url":"front/img/emoticons/emoji_27.png"},
   {"id":"[@emoji_28.gif]","title":"亲亲","url":"front/img/emoticons/emoji_28.png"},
   {"id":"[@emoji_29.gif]","title":"可爱","url":"front/img/emoticons/emoji_29.png"},
   {"id":"[@emoji_30.gif]", "title":"抓狂","url":"front/img/emoticons/emoji_30.png"},
   {"id":"[@emoji_31.gif]","title":"左哼哼","url":"front/img/emoticons/emoji_31.png"},
   {"id":"[@emoji_32.gif]","title":"顽皮","url":"front/img/emoticons/emoji_32.png"},
   {"id":"[@emoji_33.gif]","title":"鼓掌","url":"front/img/emoticons/emoji_33.png"},
   {"id":"[@emoji_34.gif]","title":"微笑","url":"front/img/emoticons/emoji_34.png"},
   {"id":"[@emoji_35.gif]","title":"心","url":"front/img/emoticons/emoji_35.png"},
   {"id":"[@emoji_36.gif]","title":"傻乐","url":"front/img/emoticons/emoji_36.png"},
   {"id":"[@emoji_37.gif]","title":"吓","url":"front/img/emoticons/emoji_37.png"},
   {"id":"[@emoji_38.gif]","title":"抱拳","url":"front/img/emoticons/emoji_38.png"},
   {"id":"[@emoji_39.gif]","title":"坏笑","url":"front/img/emoticons/emoji_39.png"},
   {"id":"[@emoji_40.gif]","title":"乐呵","url":"front/img/emoticons/emoji_40.png"},
   {"id":"[@emoji_41.gif]","title":"rock","url":"front/img/emoticons/emoji_41.png"},
   {"id":"[@emoji_42.gif]","title":"色","url":"front/img/emoticons/emoji_42.png"},
   {"id":"[@emoji_43.gif]","title":"加油","url":"front/img/emoticons/emoji_43.png"},
   {"id":"[@emoji_44.gif]","title":"可怜","url":"front/img/emoticons/emoji_44.png"},
   {"id":"[@emoji_45.gif]","title":"哈哈","url":"front/img/emoticons/emoji_45.png"},
   {"id":"[@emoji_46.gif]","title":"闭嘴","url":"front/img/emoticons/emoji_46.png"},
   {"id":"[@emoji_47.gif]","title":"高傲","url":"front/img/emoticons/emoji_47.png"},
   {"id":"[@emoji_48.gif]","title":"飞吻","url":"front/img/emoticons/emoji_48.png"},
   {"id":"[@emoji_49.gif]","title":"OK","url":"front/img/emoticons/emoji_49.png"},
   {"id":"[@emoji_50.gif]","title":"礼物","url":"front/img/emoticons/emoji_50.png"}
];


/**
 * 显示等待层
 * @param title 显示标题
 */
function ajaxLoadingShow(title){   
    $("<div class=\"datagrid-mask\"></div>").css({display:"block",width:"100%",height:$(window).height()}).appendTo("body");   
    $("<div class=\"datagrid-mask-msg\"></div>").html(title).appendTo("body").css({display:"block",left:($(document.body).outerWidth(true) - 190) / 2,top:($(window).height() - 45) / 2});   
}   

/**
 * 隐藏等待层
 */
function ajaxLoadingHide(){
    $(".datagrid-mask").remove();   
    $(".datagrid-mask-msg").remove();               
}

/**
 * 点击退出群组方法
 */
function quitRoom(){
	//由于受限于页面展示形式故每次操作均查询一下群组信息,以此来判断用户角色
	queryGroupInfo(currentChatUserId,'quit');
};

/**
 * 邀请(添加好友进入群)
 */
function addRoomMember(){
	//由于受限于页面展示形式故每次操作均查询一下群组信息,以此来判断用户角色
	queryGroupInfo(currentChatUserId,'add');
}

function delRoomMember(){
	//每次查询群组成员进行展示
	queryGroupInfo(currentChatUserId,'del');	
}

/**
 * 显示群主添加用户界面
 */
function showAddUserDiv(){
	$("#group-div-modal").html("");
	for(var i = 0; i < bothRosterArray.length; i++){
		$('#group-div-modal').append("<p>"+bothRosterArray[i]+
			"<a style='float:right;' onclick=addGroupMember('"+currentChatUserId+"','"+bothRosterArray[i]+"')>添加</a>" +		
		"</p>");
	}
	$('#option-group-div-modal').modal('toggle');
};

/**
 * 显示群主添加用户界面
 */
function showInviteUserDiv(){
	$("#group-div-modal").html("");
	for(var i = 0; i < bothRosterArray.length; i++){
		$('#group-div-modal').append("<p>"+bothRosterArray[i]+
			"<a style='float:right;' onclick=inviteUserAddGroup('"+currentChatUserId+"','"+bothRosterArray[i]+"')>邀请</a>" +		
		"</p>");
	}
	$('#option-group-div-modal').modal('toggle');
};

/**
 * 获取本地时间
 */
var getLoacalTimeString = function getLoacalTimeString() {
	var date    = new Date();
	var hours   = date.getHours();
	var minutes = date.getMinutes();
	var seconds = date.getSeconds();
	if (hours <= 9) {
		hours = "0" + hours;
	}
	if (minutes <= 9) {
		minutes = "0" + minutes;
	}
	if (seconds <= 9) {
		seconds = "0" + seconds;
	}
	return hours + ":" + minutes + ":" + seconds;
};

/**
 * 获取唯一消息ID
 */
var getUniqueId = function getUniqueId() {
	var date   = new Date();
	var hexStr = parseInt(date.getTime()).toString(16);
	return getPackagePrefix() + "3" + hexStr + getNextPackageCounter();
};

/**
 * 获取下一个计数器ID
 */
var getNextPackageCounter = function getNextPackageCounter() {
	if (packageCounter.toString().length < 4) {
		packageCounter++;
		return (Array(4).join(0) + packageCounter).slice(-4);
	} else {
		if (packageCounter > 9999) {
			packageCounter = 0;
			return getNextPackageCounter();
		}
		return packageCounter;
	}
};

/**
 * 获取Package前缀
 */
var getPackagePrefix = function getPackagePrefix() {
	var charArray = [ "0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "a", "b", "c", "d", "e", "f", "g", 
	                  "h", "i", "j", "k", "l", "m", "n", "o", "p", "q", "r", "s", "t", "u", "v", "w", "x", 
	                  "y", "z", "0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "A", "B", "C", "D", "E", 
	                  "F", "G", "H", "I","J", "K", "L", "M", "N", "O", "P", "Q", "R", "S", "T", "U", "V", 
	                  "W", "X", "Y", "Z" ];
	if (packagePrefix == null || packagePrefix.length < 5) {
		for (var i = 0; i < 5; i++) {
			packagePrefix += charArray[Math.floor(Math.random() * (charArray.length)) + 1];
		}
		return packagePrefix;
	}
	return packagePrefix;
};

$(function() {
	// 定义消息编辑文本域的快捷键，enter和ctrl+enter为发送，alt+enter为换行
	$("textarea").keydown(function(event) {
		if (event.altKey && event.keyCode == 13) {
			e = $(this).val();
			$(this).val(e + '\n');
		} else if (event.ctrlKey && event.keyCode == 13) {
			event.returnValue = false;
			sendTextMessage();
			return false;
		} else if (event.keyCode == 13) {
			event.returnValue = false;
			sendTextMessage();
			return false;
		}
	});
	// 在密码输入框时的回车登录
	$('#password').keypress(function(event) {
		var key = event.which;
		if (key == 13) {
			login();
		}
	});
});

/**
 * 扩展方法
 */
Array.prototype.remove = function(value) {
	var index = this.indexOf(value);
	if (index >= 0) {
		this.splice(index, 1);
	}
};

String.prototype.replaceAll = function(target, replacement) {
	return this.split(target).join(replacement);
};