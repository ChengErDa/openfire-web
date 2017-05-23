
/**
 * 消息服务器地址 
 */
var SERVER_HOST = "120.76.77.60";

/**
 * 消息服务器端口 
 */
var SERVER_PORT = "5222";

/**
 * 消息服务器域名 
 */
var SERVER_DOMAIN = "120.76.77.60";

/**
 * 业务服务器地址
 */
var BUSINESS_SERVER_URL = "http://120.25.62.37:9080/servlet/json";

/**
 * 默认Resource配置
 */
var DEFAULT_RESOURCE = "web";

/**
 * conference服务配置
 */
var DEFAULT_CONFERENCE_SERVER = "conference."+SERVER_DOMAIN;


/**
 *  后端连接模式
 */
var BACKEND_SERVER_HTTPBASE = "/JHB/";

var BACKEND_SERVER_TYPE = "binding";


/**
 * 心跳配置-是否启用心跳
 */
var HEARTBEAT_FLAG =  true;

/**
 * 心跳配置-间隔时间,单位秒
 */
var HEARTBEAT_TIMERVAL = 60;

/**
 * 调试模式
 */
var DEBUG = true;


/**
 * warn:  0
 * error: 1
 * info:  2
 * debug: 4 
 */
var DEBUG_LVL = 2; 