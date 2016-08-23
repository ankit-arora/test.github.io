function __wizrocket() {


    var targetDomain = 'wzrkt.com';
    // targetDomain = 'localhost:2829'; // ALWAYS comment this line before deploying

    var wz_pr = location.protocol;
    if (wz_pr !== "https:") {
        wz_pr = "http:";
    }
    var dataPostURL = wz_pr + '//' + targetDomain + '/a?t=48';
    var recorderURL = wz_pr + '//' + targetDomain + '/r?r=1';
    var emailURL = wz_pr + '//' + targetDomain + '/e?r=1';
    var targetCountURL = wz_pr + '//' + targetDomain + '/m?r=1';
    var wiz = this;
    var serviceWorkerPath = '/clevertap_sw.js'; // the service worker is placed in the doc root
    var doc = document;
    var domain = window.location.hostname;
    var broadDomain;
    var wc = window.console;
    var wzrk_error = {}; //to trap input errors
    var wiz_counter = 0; // to keep track of number of times we load the body

    // to be used for checking whether the script loaded fine and the wiz.init function was called
    var onloadcalled = 0;  // 1 = fired

    // pcookie stores current page url
    var gcookie, pcookie, scookieObj;
    var accountId;
    var GCOOKIE_NAME = "WZRK_G", PCOOKIE_NAME = "WZRK_P", KCOOKIE_NAME = "WZRK_K", CAMP_COOKIE_NAME = "WZRK_CAMP";
    var SCOOKIE_PREFIX = "WZRK_S", EV_COOKIE = "WZRK_EV", META_COOKIE = "WZRK_META", PR_COOKIE = "WZRK_PR", ARP_COOKIE = " WZRK_ARP";
    var resetCookie = false;
    var SCOOKIE_NAME;
    var LCOOKIE_NAME = "WZRK_L"; // store the last event to fire in case of race condition
    var NOTIF_COOKIE_NAME = "WZRK_N"; // check if the user has subscribed for web push notifications
    var globalEventsMap, globalProfileMap, lastSessionId, currentSessionId;
    var storageDelim = "|$|";
    var staleEvtMaxTime = 20 * 60; //20 mins

    // path to reference the JS for our dialog
    var wizAlertJSPath = 'https://d2r1yp2w7bby2u.cloudfront.net/js/wzrk_dialog.min.js';

    var FIRST_PING_FREQ_IN_MILLIS = 2 * 60 * 1000; // 2 mins
    var CONTINUOUS_PING_FREQ_IN_MILLIS = 5 * 60 * 1000; // 5 mins

    var TWENTY_MINS = 20 * 60 * 1000;

    var SCOOKIE_EXP_TIME_IN_SECS = 60 * 20;  // 20 mins


    var EVT_PING = "ping", EVT_PUSH = "push";

    var wizrocket = window['wizrocket'];

    var REQ_N = 0;
    var RESP_N = 0;

    if (typeof clevertap != 'undefined') {
        wizrocket = clevertap;
        window['wizrocket'] = clevertap;
    } else {
        window['clevertap'] = wizrocket;
    }

    var webPushEnabled; // gets set to true on page request, when chrome notifs have been integrated completely

    wiz.is_onloadcalled = function () {
        return (onloadcalled === 1);
    };

    // use these to add and remove sweet alert dialogs as necessary
    wiz.addWizAlertJS = function () {
        var scriptTag = doc.createElement('script');
        scriptTag.setAttribute('type', 'text/javascript');
        scriptTag.setAttribute('id', 'wzrk-alert-js');
        scriptTag.setAttribute('src', wizAlertJSPath);

        // add the script tag to the end of the body
        document.getElementsByTagName('body')[0].appendChild(scriptTag);

        return scriptTag;
    };

    wiz.removeWizAlertJS = function () {
        var scriptTag = doc.getElementById('wzrk-alert-js');
        scriptTag.parentNode.removeChild(scriptTag);
    };


    wiz.enableWebPush = function (enabled) {
        webPushEnabled = enabled;
        if (webPushEnabled && notifApi.notifEnabledFromApi) {
            wiz.handleNotificationRegistration(notifApi.displayArgs);
        } else if (!webPushEnabled && notifApi.notifEnabledFromApi) {
            wc.e('Ensure that web push notifications are fully enabled and integrated before requesting them');
        }
    };

    /**
     * Sets up a service worker for chrome push notifications and sends the data to LC
     */
    wiz.setUpChromeNotifications = function () {


        if ('serviceWorker' in navigator) {
            navigator["serviceWorker"]['register'](serviceWorkerPath)['then'](function () {
                return navigator['serviceWorker']['ready'];
            })['then'](function (serviceWorkerRegistration) {
                serviceWorkerRegistration['pushManager']['subscribe']({'userVisibleOnly': true})
                    ['then'](function (subscription) {
                    wc.l('Service Worker registered. Endpoint: ' + subscription['endpoint']);

                    // convert the subscription keys to strings; this sets it up nicely for pushing to LC
                    var subscriptionData = JSON.parse(JSON.stringify(subscription));

                    // remove the common chrome endpoint at the beginning of the token
                    subscriptionData['endpoint'] = subscriptionData['endpoint'].split('/').pop();

                    // if the token changes; push over the new stuff
                    if (typeof wiz.readFromLSorCookie(NOTIF_COOKIE_NAME) !== 'undefined') {
                        if (subscriptionData['endpoint'] === JSON.parse(wiz.readFromLSorCookie(NOTIF_COOKIE_NAME))['endpoint'])
                            return;
                    }
                    // the final payload is just the stringified subscription object
                    var payload = subscriptionData;
                    payload = wiz.addSystemDataToObject(payload, true);
                    payload = JSON.stringify(payload);
                    var pageLoadUrl = dataPostURL;
                    pageLoadUrl = wiz.addToURL(pageLoadUrl, "type", "data");
                    pageLoadUrl = wiz.addToURL(pageLoadUrl, "d", wiz.compressData(payload));
                    wiz.fireRequest(pageLoadUrl);

                    // persist to local storage
                    wiz.saveToLSorCookie(NOTIF_COOKIE_NAME, payload);
                })['catch'](function (error) {
                    wc.l('Error subscribing: ' + error);
                });
            })['catch'](function (err) {
                wc.l('error registering service worker: ' + err);
            });
        }
    };

    wiz.init = function () {

        wiz.g(); // load cookies on pageload; this HAS to be the first thing in this method

        wc = {
            e: function (msg) {
                if (window.console) {
                    var ts = new Date().getTime();
                    console.error(ts + " " + msg);
                }
            },
            d: function (msg) {
                if (window.console && wiz.isDebug()) {
                    var ts = new Date().getTime();
                    console.debug(ts + " " + msg);
                }
            },
            l: function (msg) {
                if (window.console) {
                    var ts = new Date().getTime();
                    console.log(ts + " " + msg);
                }
            }
        };


        if (typeof wizrocket['account'][0] == 'undefined') {
            wc.e(wzrk_msg['embed-error']);
            return;
        } else {
            accountId = wizrocket['account'][0]['id'];

            if (typeof accountId == 'undefined' || accountId == '') {
                wc.e(wzrk_msg['embed-error']);
                return;
            }
            SCOOKIE_NAME = SCOOKIE_PREFIX + '_' + accountId;

        }

        var currLocation = location.href;
        var url_params = wzrk_util.getURLParams(location.href.toLowerCase());

        if (typeof url_params['e'] != 'undefined' && url_params['wzrk_ex'] == '0') {
            return;
        }


        wiz.pushOutStaleEvents();
        wiz.overloadArrayPush();

        var firePageLoadRequest = true;

        if (currLocation == pcookie) {  // don't fire if cookie has curr url as value
            firePageLoadRequest = false;
        }

        var FIFTEEN_MINS_IN_SECS = 60 * 15; //seconds in minute * number of mins
        wiz.createCookie(PCOOKIE_NAME, currLocation, FIFTEEN_MINS_IN_SECS, location.hostname); // self-destruct after 15 mins


        if (firePageLoadRequest) {

            // -- update page count
            var obj = wiz.getSessionCookieObject();
            var pgCount = (typeof obj['p'] == 'undefined') ? 0 : obj['p'];
            obj['p'] = ++pgCount;
            wiz.setSessionCookieObject(obj);
            // -- update page count


            var data = {};

            //var curr_domain = doc.location.hostname;
            var referrer_domain = wzrk_util.getDomain(doc.referrer);

            if (domain != referrer_domain) {
                var maxLen = 120;
                if (referrer_domain != "") {  //referrer exists, sending even when session exists as "x.in.com" and "y.in.com" could be separate accounts, but session created on domain "in.com"
                    referrer_domain = referrer_domain.length > maxLen ? referrer_domain.substring(0, maxLen) : referrer_domain;
                    data['referrer'] = referrer_domain;
                }


                var utm_source = url_params['utm_source'] || url_params['wzrk_source'];
                if (typeof utm_source != 'undefined') {
                    utm_source = utm_source.length > maxLen ? utm_source.substring(0, maxLen) : utm_source;
                    data['us'] = utm_source;                  //utm_source
                }

                var utm_medium = url_params['utm_medium'] || url_params['wzrk_medium'];
                if (typeof utm_medium != 'undefined') {
                    utm_medium = utm_medium.length > maxLen ? utm_medium.substring(0, maxLen) : utm_medium;
                    data['um'] = utm_medium;                 //utm_medium
                }


                var utm_campaign = url_params['utm_campaign'] || url_params['wzrk_campaign'];
                if (typeof utm_campaign != 'undefined') {
                    utm_campaign = utm_campaign.length > maxLen ? utm_campaign.substring(0, maxLen) : utm_campaign;
                    data['uc'] = utm_campaign;               //utm_campaign
                }

                // also independently send wzrk_medium to the backend
                if (typeof url_params['wzrk_medium'] != 'undefined') {
                    var wm = url_params['wzrk_medium'];
                    if (wm.match(/^email$|^social$|^search$/)) {
                        data['wm'] = wm;                       //wzrk_medium
                    }

                }

            }

            data = wiz.addSystemDataToObject(data);
            data['cpg'] = currLocation;
            data[CAMP_COOKIE_NAME] = wiz.getCampaignObj();
            var pageLoadUrl = dataPostURL;
            wiz.addDSyncFlag(data);
            //send dsync flag when page = 1
            if (data['pg'] != 'undefined' && data['pg'] == 1) {
                wiz.overrideDSyncFlag(data);
            }
            pageLoadUrl = wiz.addToURL(pageLoadUrl, "type", "page");
            pageLoadUrl = wiz.addToURL(pageLoadUrl, "d", wiz.compressData(JSON.stringify(data)));
            wiz.fireRequest(pageLoadUrl);


            // -- ping request logic

            var pingRequest = function () {
                var pageLoadUrl = dataPostURL;
                var data = {};
                data = wiz.addSystemDataToObject(data);

                pageLoadUrl = wiz.addToURL(pageLoadUrl, "type", EVT_PING);
                pageLoadUrl = wiz.addToURL(pageLoadUrl, "d", wiz.compressData(JSON.stringify(data)));
                wiz.fireRequest(pageLoadUrl);
            };

            setTimeout(function () {
                if (pgCount <= 3) {  // send ping for up to 3 pages
                    pingRequest();
                }

                if (wiz.isPingContinuous()) {
                    setInterval(function () {
                        pingRequest();
                    }, CONTINUOUS_PING_FREQ_IN_MILLIS);
                }
            }, FIRST_PING_FREQ_IN_MILLIS);

            // -- ping request logic

        } // if(firePageLoadRequest)


        if (typeof wizrocket['session'] == 'undefined') {

            wizrocket['event']['getDetails'] = function (evtName) {
                if (!wzrk_util.isPersonalizationActive()) {
                    return;
                }
                if (typeof globalEventsMap == 'undefined') {
                    globalEventsMap = wiz.readFromLSorCookie(EV_COOKIE);
                }
                if (typeof globalEventsMap == 'undefined') {
                    return;
                }
                var evtObj = globalEventsMap[evtName];
                var respObj = {};

                if (typeof evtObj != 'undefined') {
                    respObj['firstTime'] = new Date(evtObj[1] * 1000);
                    respObj['lastTime'] = new Date(evtObj[2] * 1000);
                    respObj['count'] = evtObj[0];
                    return respObj;
                }


            };

            wizrocket['profile']['getAttribute'] = function (propName) {
                if (!wzrk_util.isPersonalizationActive()) {
                    return;
                }
                if (typeof globalProfileMap == 'undefined') {
                    globalProfileMap = wiz.readFromLSorCookie(PR_COOKIE);
                }
                if (typeof globalProfileMap != 'undefined') {
                    return globalProfileMap[propName];
                }
            };
            wizrocket['session'] = {};
            wizrocket['session']['getTimeElapsed'] = function () {
                if (!wzrk_util.isPersonalizationActive()) {
                    return;
                }
                if (typeof scookieObj != 'undefined') {
                    scookieObj = wiz.getSessionCookieObject();
                }
                var sessionStart = scookieObj['s'];
                if (typeof sessionStart != 'undefined') {
                    var ts = wzrk_util.getNow();
                    return Math.floor(ts - sessionStart);
                }
            };

            wizrocket['user'] = {};
            wizrocket['user']['getTotalVisits'] = function () {
                if (!wzrk_util.isPersonalizationActive()) {
                    return;
                }
                var visitCount = wiz.getMetaProp('sc');
                if (typeof visitCount == 'undefined') {
                    visitCount = 1;
                }
                return visitCount;
            };

            wizrocket['session']['getPageCount'] = function () {
                if (!wzrk_util.isPersonalizationActive()) {
                    return;
                }

                if (typeof scookieObj != 'undefined') {
                    scookieObj = wiz.getSessionCookieObject();
                }
                return scookieObj['p'];
            };

            wizrocket['user']['getLastVisit'] = function () {
                if (!wzrk_util.isPersonalizationActive()) {
                    return;
                }
                var prevSession = wiz.getMetaProp('ps');
                if (typeof prevSession != 'undefined') {
                    return new Date(prevSession * 1000);
                }
            };
        }
        onloadcalled = 1;   //always the last line in this function


    };


    wiz.pushOutStaleEvents = function () {
        var urlStr = wiz.readCookie(LCOOKIE_NAME);

        if (urlStr && urlStr.length > 10) {
            var urlArr = urlStr.split(storageDelim);
            var url = urlArr[0];

            var epoch = urlArr[1];
            var retryCount = (typeof urlArr[2] == 'undefined' ? 0 : urlArr[2]);
            var now = wzrk_util.getNow();
            var d = (now - epoch);         // delta is (now - request saved time) in seconds.

            if (d > staleEvtMaxTime || retryCount >= 1) { // try once max for stale evt.
                wc.d("ign stale ck " + LCOOKIE_NAME + " w/val: " + urlStr);
            } else {
                // save request retry count
                retryCount = retryCount + 1;

                var data = url + storageDelim + epoch + storageDelim + retryCount;

                wiz.createBroadCookie(LCOOKIE_NAME, data, TWENTY_MINS, domain); // self-destruct after 20 minutes
                wc.d("stored in " + LCOOKIE_NAME + "-> " + data);

                // use the current location protocol, since it may have gone from http to https when we saved the original request
                var newUrl = wz_pr + url.substring(url.indexOf('//'));

                // using the epoch as the request id - this helps reduce dupe events
                wiz.fireRequest(newUrl + '&dl=' + d + '&i=' + epoch);
            }
        }
    };

    wiz.readFromLSorCookie = function (property) {
        var data;
        if (wzrk_util.isLocalStorageSupported()) {
            data = localStorage[property];
        } else {
            data = wiz.readCookie(property);
        }
        if (typeof data != 'undefined' && data !== null) {
            return JSON.parse(decodeURIComponent(data));
        }
    };

    wiz.saveToLSorCookie = function (property, val) {
        if (typeof val == 'undefined' || val == 'undefined') {
            return;
        }
        try {
            if (wzrk_util.isLocalStorageSupported()) {
                localStorage[property] = encodeURIComponent(JSON.stringify(val));
            } else {
                wiz.createCookie(property, encodeURIComponent(JSON.stringify(val)), 0, domain);
            }
        } catch (e) {
        }
    };

    wiz.processEventArray = function (eventArr) {

        if (wzrk_util.isArray(eventArr)) {

            /** looping since the events could be fired in quick succession, and we could end up
             with multiple pushes without getting a chance to process
             */
            while (eventArr.length > 0) {

                var eventName = eventArr.shift(); // take out name of the event

                if (!wzrk_util.isString(eventName)) {
                    wc.e(wzrk_msg['event-error']);
                    return;
                }

                if (eventName.length > 32) {
                    eventName = eventName.substring(0, 32);
                    wiz.reportError(510, eventName + "... length exceeded 32 chars. Trimmed.");
                }

                if (eventName == "Stayed" || eventName == "UTM Visited" || eventName == "App Launched" ||
                    eventName == "Notification Sent" || eventName == "Notification Viewed" || eventName == "Notification Clicked") {
                    wiz.reportError(513, eventName + " is a restricted system event. It cannot be used as an event name. Not sent.");
                    continue;
                }


                var data = {};
                data['type'] = "event";
                data['evtName'] = wzrk_util.sanitize(eventName, unsupportedKeyCharRegex);
                data[CAMP_COOKIE_NAME] = wiz.getCampaignObj();
                if (eventArr.length != 0) {
                    var eventObj = eventArr.shift();

                    if (!wzrk_util.isObject(eventObj)) {
                        eventArr.unshift(eventObj);    // put it back if it is not an object
                    } else {
                        //check Charged Event vs. other events.


                        if (eventName == "Charged") {
                            if (!wiz.isChargedEventStructureValid(eventObj)) {
                                wiz.reportError(511, "Charged event structure invalid. Not sent.");
                                continue;
                            }
                        } else {
                            if (!wiz.isEventStructureFlat(eventObj)) {
                                wiz.reportError(512, eventName + " event structure invalid. Not sent.");
                                continue;
                            }

                        }

                        data['evtData'] = eventObj;
                    }
                }
                wiz.addToLocalEventMap(data['evtName']);
                data = wiz.addSystemDataToObject(data);
                wiz.addDSyncFlag(data);
                var compressedData = wiz.compressData(JSON.stringify(data));

                var pageLoadUrl = dataPostURL;
                var pageLoadUrl = wiz.addToURL(pageLoadUrl, "type", EVT_PUSH);
                pageLoadUrl = wiz.addToURL(pageLoadUrl, "d", compressedData);


                wiz.saveAndFireRequest(pageLoadUrl, false);

            }

        }
    };

    wiz.addToLocalEventMap = function (evtName) {
        if (wzrk_util.isLocalStorageSupported()) {
            if (typeof globalEventsMap == 'undefined') {
                globalEventsMap = wiz.readFromLSorCookie(EV_COOKIE);
                if (typeof globalEventsMap == 'undefined') {
                    globalEventsMap = {};
                }
            }
            var nowTs = wzrk_util.getNow();
            var evtDetail = globalEventsMap[evtName];
            if (typeof evtDetail != 'undefined') {
                evtDetail[2] = nowTs;
                evtDetail[0]++;
            } else {
                evtDetail = [];
                evtDetail.push(1);
                evtDetail.push(nowTs);
                evtDetail.push(nowTs);
            }
            globalEventsMap[evtName] = evtDetail;
            wiz.saveToLSorCookie(EV_COOKIE, globalEventsMap);
        }
    };

    wiz.addToLocalProfileMap = function (profileObj, override) {
        if (wzrk_util.isLocalStorageSupported()) {
            if (typeof globalProfileMap == 'undefined') {
                globalProfileMap = wiz.readFromLSorCookie(PR_COOKIE);
                if (typeof globalProfileMap == 'undefined') {
                    globalProfileMap = {};
                }
            }

            //Move props from custom bucket to outside.
            if (typeof profileObj['_custom'] != 'undefined') {
                var keys = profileObj['_custom'];
                for (var key in keys) {
                    profileObj[key] = keys[key];
                }
                delete profileObj['_custom'];
            }

            for (var prop in profileObj) {
                if (profileObj.hasOwnProperty(prop)) {
                    if (globalProfileMap.hasOwnProperty(prop) && !override) {
                        continue;
                    }
                    globalProfileMap[prop] = profileObj[prop];
                }
            }
            if (typeof globalProfileMap['_custom'] != 'undefined') {
                delete globalProfileMap['_custom'];
            }
            wiz.saveToLSorCookie(PR_COOKIE, globalProfileMap);
        }
    };

    wiz.overrideDSyncFlag = function (data) {
        if (wzrk_util.isPersonalizationActive()) {
            data['dsync'] = true;
        }
    };

    wiz.addARPToRequest = function (url) {
        if (wzrk_util.isLocalStorageSupported() && typeof localStorage[ARP_COOKIE] != 'undefined') {
            return wiz.addToURL(url, 'arp', wiz.compressData(JSON.stringify(wiz.readFromLSorCookie(ARP_COOKIE))));
        }
        return url;
    };

    wiz.addDSyncFlag = function (data) {
        if (wzrk_util.isPersonalizationActive()) {
            var lastSyncTime = wiz.getMetaProp('lsTime');
            var expirySeconds = wiz.getMetaProp('exTs');

            //dsync not found in local storage - get data from server
            if (typeof lastSyncTime == 'undefined' || typeof expirySeconds == 'undefined') {
                data['dsync'] = true;
                return;
            }
            var now = wzrk_util.getNow();
            //last sync time has expired - get fresh data from server
            if (lastSyncTime + expirySeconds < now) {
                data['dsync'] = true;
            }
        }

    };

    wiz.getCampaignObj = function () {
        var campIds;
        if (wzrk_util.isSessionStorageSupported()) {
            var campIds = sessionStorage[CAMP_COOKIE_NAME];
            if (typeof campIds == 'undefined') {
                campIds = {};
            } else {
                campIds = JSON.parse(decodeURIComponent(campIds).replace(singleQuoteRegex, "\""))
            }
        }
        return campIds;
    };


    var setInstantDeleteFlagInK = function () {
        var k = wiz.readFromLSorCookie(KCOOKIE_NAME);
        if (typeof k == 'undefined') {
            k = {};
        }
        k['flag'] = true;
        wiz.saveToLSorCookie(KCOOKIE_NAME, k);
    };

    wiz.logout = function () {
        setInstantDeleteFlagInK();
    };

    wiz.arp = function (jsonMap) {
        if (wzrk_util.isLocalStorageSupported()) {
            try {
                var arpFromStorage = wiz.readFromLSorCookie(ARP_COOKIE);
                if (typeof arpFromStorage == 'undefined') {
                    arpFromStorage = {};
                }

                for (var key in jsonMap) {
                    if (jsonMap.hasOwnProperty(key)) {
                        if (jsonMap[key] == -1) {
                            delete arpFromStorage[key];
                        } else {
                            arpFromStorage[key] = jsonMap[key];
                        }
                    }
                }
                wiz.saveToLSorCookie(ARP_COOKIE, arpFromStorage);


            } catch (e) {
                wc.e("Unable to parse ARP JSON: " + e);
            }

        }
    };

    wiz.processProfileArray = function (profileArr) {

        if (wzrk_util.isArray(profileArr) && profileArr.length > 0) {

            var outerObj = profileArr.pop();
            var data = {};
            var profileObj;
            if (typeof outerObj['Site'] != 'undefined') {       //organic data from the site
                profileObj = outerObj['Site'];
                if (wzrk_util.isObjectEmpty(profileObj) || !wiz.isProfileValid(profileObj)) {
                    return;
                }

            } else if (typeof outerObj['Facebook'] != 'undefined') {   //fb connect data
                var FbProfileObj = outerObj['Facebook'];
                //make sure that the object contains any data at all

                if (!wzrk_util.isObjectEmpty(FbProfileObj) && (!FbProfileObj['error'])) {
                    profileObj = wiz.processFBUserObj(FbProfileObj);
                }

            } else if (typeof outerObj['Google Plus'] != 'undefined') {
                var GPlusProfileObj = outerObj['Google Plus'];
                if (!wzrk_util.isObjectEmpty(GPlusProfileObj) && (!GPlusProfileObj['error'])) {
                    profileObj = wiz.processGPlusUserObj(GPlusProfileObj);
                }
            }


            var deleteUser = function () {
                resetCookie = true;
                if (wzrk_util.isLocalStorageSupported()) {
                    delete localStorage[GCOOKIE_NAME];
                    delete localStorage[KCOOKIE_NAME];
                    delete localStorage[PR_COOKIE];
                    delete localStorage[EV_COOKIE];
                    delete localStorage[META_COOKIE];
                }
                if (wzrk_util.isSessionStorageSupported()) {
                    delete sessionStorage[CAMP_COOKIE_NAME];
                }
                wiz.deleteCookie(GCOOKIE_NAME, broadDomain);
                wiz.deleteCookie(CAMP_COOKIE_NAME, domain);
                wiz.deleteCookie(KCOOKIE_NAME, domain);
                wiz.deleteCookie(SCOOKIE_NAME, broadDomain);
                gcookie = null;
                scookieObj = '';
                //reset request number when user is deleted
                REQ_N = 0;
                RESP_N = 0;
            };

            var addToK = function (ids) {
                var k = wiz.readFromLSorCookie(KCOOKIE_NAME);
                var lseenTs, idArr, flag;
                var nowDate = new Date();
                var now = nowDate.getTime();
                if (typeof k == 'undefined') {
                    k = {};
                    lseenTs = now;
                    idArr = ids;
                } else {/*check if already exists*/
                    lseenTs = k['ls'];
                    idArr = k['id'];
                    var sameUser = false;
                    if (typeof idArr == 'undefined') {
                        idArr = [];
                        sameUser = true;
                    }
                    if (idArr.length > 20) {
                        return;
                    }
                    flag = k['flag'];
                    var newRelatedIds = [];
                    for (var id in ids) {
                        if (ids.hasOwnProperty(id)) {
                            var found = false;
                            for (var elem in idArr) {
                                if (idArr.hasOwnProperty(elem)) {
                                    if (idArr[elem] === ids[id]) {
                                        found = true;
                                        sameUser = true;
                                        break;
                                    }
                                }
                            }
                            if (!found) {
                                idArr.push(ids[id]);
                            }
                        }
                    }
                    if (!sameUser) {
                        if (flag || (now - lseenTs > (60 * 1000))) {
                            /* flag has been set - user has been logged out - new user || 60 secs have passed since last prof_push so new user*/
                            //wipe cookie etc
                            deleteUser();
                            idArr = ids;
                        }
                    }
                }
                k['id'] = idArr;
                k['ls'] = now;
                k['flag'] = false;
                wiz.saveToLSorCookie(KCOOKIE_NAME, k);
            };

            if (typeof profileObj != 'undefined' && (!wzrk_util.isObjectEmpty(profileObj))) {   // profile got set from above
                data['type'] = "profile";
                data['profile'] = profileObj;
                var ids = [];
                if (wzrk_util.isLocalStorageSupported()) {
                    if (typeof profileObj['Email'] != 'undefined') {
                        ids.push(profileObj['Email']);
                    }
                    if (typeof profileObj['GPID'] != 'undefined') {
                        ids.push("GP:" + profileObj['GPID']);
                    }
                    if (typeof profileObj['FBID'] != 'undefined') {
                        ids.push("FB:" + profileObj['FBID']);
                    }
                    if (typeof profileObj['Identity'] != 'undefined') {
                        ids.push(profileObj['Identity']);
                    }
                    if (ids.length > 0) {
                        addToK(ids);
                    }
                }
                wiz.addToLocalProfileMap(profileObj, true);
                data = wiz.addSystemDataToObject(data);
                if (resetCookie) {
                    data['rc'] = true;
                }

                wiz.overrideDSyncFlag(data);
                var compressedData = wiz.compressData(JSON.stringify(data));

                var pageLoadUrl = dataPostURL;
                pageLoadUrl = wiz.addToURL(pageLoadUrl, "type", EVT_PUSH);
                pageLoadUrl = wiz.addToURL(pageLoadUrl, "d", compressedData);

                wiz.saveAndFireRequest(pageLoadUrl, resetCookie);

            }
        }

    };

    wiz.processLoginArray = function (loginArr) {
        if (wzrk_util.isArray(loginArr) && loginArr.length > 0) {
            var profileObj = loginArr.pop();
            var processProfile = typeof profileObj != 'undefined' && wzrk_util.isObject(profileObj) &&
                ((typeof profileObj['Site'] != 'undefined' && Object.keys(profileObj["Site"]).length > 0) ||
                (typeof profileObj['Facebook'] != 'undefined' && Object.keys(profileObj["Facebook"]).length > 0 ) ||
                (typeof profileObj['Google Plus'] != "undefined" && Object.keys(profileObj["Google Plus"]).length > 0));
            if (processProfile) {
                setInstantDeleteFlagInK();
                wiz.processProfileArray([profileObj]);
            } else {
                //console.error
                wc.e("Profile object is in incorrect format");
            }
        }
    };

    wiz.overloadArrayPush = function () {

        if (typeof wizrocket['onUserLogin'] === "undefined") {
            wizrocket['onUserLogin'] = [];
        }

        wizrocket['onUserLogin'].push = function () {
            //since arguments is not an array, convert it into an array
            wiz.processLoginArray(Array.prototype.slice.call(arguments));
            return 0;
        };

        wizrocket['event'].push = function () {
            //since arguments is not an array, convert it into an array
            wiz.processEventArray(Array.prototype.slice.call(arguments));
            return 0;
        };

        if (typeof wizrocket['notifications'] === 'undefined')
            wizrocket['notifications'] = [];

        wizrocket['notifications'].push = function () {
            wiz.setUpWebPush(Array.prototype.slice.call(arguments));
            return 0;
        };


        wizrocket['profile'].push = function () {
            //since arguments is not an array, convert it into an array
            wiz.processProfileArray(Array.prototype.slice.call(arguments));
            return 0;
        };
        wizrocket['logout'] = wiz.logout;

        wiz.processLoginArray(wizrocket['onUserLogin']);  // process old stuff from the login array before we overloaded the push method
        wiz.processEventArray(wizrocket['event']);      // process old stuff from the event array before we overloaded the push method
        wiz.processProfileArray(wizrocket['profile']);  // process old stuff from the profile array before we overloaded the push method
        wiz.setUpWebPush(wizrocket['notifications']); // process old stuff from notifications array before overload

        // clean up the notifications array
        while (wizrocket['notifications'].length > 0)
            wizrocket['notifications'].pop();
    };


    wiz.saveAndFireRequest = function (url, override) {

        var now = wzrk_util.getNow();
        var data = url + storageDelim + now;

        wiz.createBroadCookie(LCOOKIE_NAME, data, TWENTY_MINS, domain); // self-destruct after 20 minutes
        wc.d("stored in " + LCOOKIE_NAME + "-> " + data);
        if (!resetCookie || override) {
            wiz.fireRequest(url + '&i=' + now);
        }

    };


// profile like https://developers.google.com/+/api/latest/people
    wiz.processGPlusUserObj = function (user) {

        var profileData = {};
        if (typeof user['displayName'] != 'undefined') {
            profileData['Name'] = user['displayName'];
        }
        if (typeof user['id'] != 'undefined') {
            profileData['GPID'] = user['id'] + "";
        }

        if (typeof user['gender'] != 'undefined') {
            if (user['gender'] == "male") {
                profileData['Gender'] = "M";
            } else if (user['gender'] == "female") {
                profileData['Gender'] = "F";
            }
        }

        if (typeof user['image'] != 'undefined') {
            if (user['image']['isDefault'] == false) {
                profileData['Photo'] = user['image'].url.split('?sz')[0];
            }
        }

        if (typeof user['emails'] != "undefined") {
            for (var i = 0; i < user['emails'].length; i++) {
                var emailObj = user['emails'][i];
                if (emailObj.type == 'account') {
                    profileData['Email'] = emailObj.value;
                }
            }
        }


        if (typeof user['organizations'] != "undefined") {
            profileData['Employed'] = 'N';
            for (var i = 0; i < user['organizations'].length; i++) {
                var orgObj = user['organizations'][i];
                if (orgObj.type == 'work') {
                    profileData['Employed'] = 'Y';
                }
            }
        }


        if (typeof user['birthday'] != 'undefined') {
            var yyyymmdd = user['birthday'].split('-'); //comes in as "1976-07-27"
            var dob = $WZRK_WR.setDate(yyyymmdd[0] + yyyymmdd[1] + yyyymmdd[2]);
            profileData['DOB'] = dob;
        }


        if (typeof user['relationshipStatus'] != 'undefined') {
            profileData['Married'] = 'N';
            if (user['relationshipStatus'] == 'married') {
                profileData['Married'] = 'Y';
            }
        }
        wc.d("gplus usr profile " + JSON.stringify(profileData));

        return profileData;
    };

    wiz.processFBUserObj = function (user) {
        var profileData = {};
        profileData['Name'] = user['name'];
        if (typeof user['id'] != 'undefined') {
            profileData['FBID'] = user['id'] + "";
        }

        // Feb 2014 - FB announced over 50 gender options, hence we specifically look for male or female. Rest we don't care.
        if (user['gender'] == "male") {
            profileData['Gender'] = "M";
        } else if (user['gender'] == "female") {
            profileData['Gender'] = "F";
        }

        var getHighestEducation = function (eduArr) {
            if (typeof eduArr != "undefined") {
                var college = "";
                var highschool = "";

                for (var i = 0; i < eduArr.length; i++) {
                    var edu = eduArr[i];
                    if (typeof edu.type != "undefined") {
                        var type = edu.type;
                        if (type == "Graduate School") {
                            return "Graduate";
                        } else if (type == "College") {
                            college = "1";
                        } else if (type == "High School") {
                            highschool = "1";
                        }
                    }
                }

                if (college == "1") {
                    return "College";
                } else if (highschool == "1") {
                    return "School";
                }
            }
            return; //nothing
        }

        if (user['relationship_status'] != 'undefined') {
            profileData['Married'] = 'N';
            if (user['relationship_status'] == 'Married') {
                profileData['Married'] = 'Y';
            }
        }

        var edu = getHighestEducation(user['education']);
        if (typeof edu != "undefined") {
            profileData['Education'] = edu;
        }

        var work = (typeof user['work'] != 'undefined') ? user['work'].length : 0;
        if (work > 0) {
            profileData['Employed'] = 'Y';
        } else {
            profileData['Employed'] = 'N';
        }

        if (typeof user['email'] != "undefined") {
            profileData['Email'] = user['email'];
        }

        if (typeof user['birthday'] != "undefined") {
            var mmddyy = user['birthday'].split('/'); //comes in as "08/15/1947"
            var dob = $WZRK_WR.setDate(mmddyy[2] + mmddyy[0] + mmddyy[1]);
            profileData['DOB'] = dob;
        }
        return profileData;
    };


    wiz.getEmail = function () {
        wiz.handleEmailSubscription('-1');
    };


    wiz.unSubEmail = function () {
        wiz.handleEmailSubscription("0")
    };

    wiz.subEmail = function () {
        wiz.handleEmailSubscription("1")
    };

    wiz.handleEmailSubscription = function (subscription) {

        var url_params_as_is = wzrk_util.getURLParams(location.href);  // can't use url_params as it is in lowercase above
        var encodedEmailId = url_params_as_is['e'];

        if (typeof encodedEmailId != 'undefined') {
            var data = {};
            data['id'] = accountId;  //accountId

            var url = emailURL;
            url = wiz.addToURL(url, "e", encodedEmailId);
            url = wiz.addToURL(url, "d", wiz.compressData(JSON.stringify(data)));

            if (subscription != '-1') {
                url = wiz.addToURL(url, "sub", subscription);
            }

            wiz.fireRequest(url);
        }
    };


    wiz.reportError = function (code, desc) {
        wzrk_error['c'] = code;
        wzrk_error['d'] = desc;
        wc.e(wzrk_error_txt + code + ": " + desc);
    };


    //to debug put this in the JS console -> sessionStorage['WZRK_D']="";
    wiz.isDebug = function () {
        return ((typeof sessionStorage != 'undefined') && sessionStorage['WZRK_D'] == '');
    };

    wiz.isPingContinuous = function () {
        return ((typeof wzrk_d != 'undefined') && (wzrk_d['ping'] == 'continuous'));
    };


    wiz.compressData = function (dataObject) {
        wc.d('dobj:' + dataObject);
        var dat = LZS.compressToBase64(dataObject);
        return dat;
    };


    wiz.addSystemDataToObject = function (dataObject, ignoreTrim) {
        // ignore trim for chrome notifications; undefined everywhere else
        if (typeof ignoreTrim === 'undefined') {
            dataObject = wzrk_util.removeUnsupportedChars(dataObject);
        }
        if (!wzrk_util.isObjectEmpty(wzrk_error)) {
            dataObject['wzrk_error'] = wzrk_error;
            wzrk_error = {};
        }

        dataObject['id'] = accountId;                                                     //accountId

        if (gcookie != null) {
            dataObject['g'] = gcookie;
        }                               //Global cookie

        var obj = wiz.getSessionCookieObject();

        dataObject['s'] = obj['s'];                                                      //Session cookie
        dataObject['pg'] = (typeof obj['p'] == 'undefined') ? 1 : obj['p'];                //Page count

        return dataObject;
    };


    wiz.getSessionCookieObject = function () {
        var scookieStr = wiz.readCookie(SCOOKIE_NAME);
        var obj = {};

        if (scookieStr != null) {
            // converting back single quotes to double for JSON parsing - http://www.iandevlin.com/blog/2012/04/html5/cookies-json-localstorage-and-opera
            // todo - remove after April 15, 2015. Since all session cookies with older encoding would've been flushed out from the world
            scookieStr = scookieStr.replace(singleQuoteRegex, "\"");

            obj = JSON.parse(scookieStr);
            if (!wzrk_util.isObject(obj)) {
                obj = {};
            } else {
                if (typeof obj['t'] != 'undefined') {   // check time elapsed since last request
                    var lasttime = obj['t'];
                    var now = wzrk_util.getNow();
                    if ((now - lasttime) > (SCOOKIE_EXP_TIME_IN_SECS + 60)) // adding 60 seconds to compensate for in-journey requests

                    //ideally the cookie should've died after SCOOKIE_EXP_TIME_IN_SECS but it's still around as we can read
                    //hence we shouldn't use it.

                        obj = {};

                }
            }
        }
        scookieObj = obj;
        return obj;
    };


    wiz.setSessionCookieObject = function (obj) {

        var objStr = JSON.stringify(obj);

        wiz.createBroadCookie(SCOOKIE_NAME, objStr, SCOOKIE_EXP_TIME_IN_SECS, domain);

    };


    wiz.g = function () {
        gcookie = wiz.readCookie(GCOOKIE_NAME);

        if (gcookie == null && wzrk_util.isLocalStorageSupported()) { // only get from localStorage if cookie is null
            gcookie = localStorage[GCOOKIE_NAME];
        }

        pcookie = wiz.readCookie(PCOOKIE_NAME);
    };

    wiz.setMetaProp = function (key, value) {
        if (wzrk_util.isLocalStorageSupported()) {
            var wzrkMetaObj = wiz.readFromLSorCookie(META_COOKIE);
            if (typeof wzrkMetaObj == 'undefined') {
                wzrkMetaObj = {};
            }
            wzrkMetaObj[key] = value;
            wiz.saveToLSorCookie(META_COOKIE, wzrkMetaObj);
        }
    };

    wiz.getMetaProp = function (key) {
        if (wzrk_util.isLocalStorageSupported()) {
            var wzrkMetaObj = wiz.readFromLSorCookie(META_COOKIE);
            if (typeof wzrkMetaObj != 'undefined') {
                return wzrkMetaObj[key];
            }
        }
    };

    wiz.manageSession = function (session) {
        //first time. check if current session id in localstorage is same
        //if not same then prev = current and current = this new session
        if (typeof currentSessionId == 'undefined') {
            var currentSessionInLS = wiz.getMetaProp('cs');
            //if sessionId in meta is undefined - set current to both
            if (typeof currentSessionInLS == 'undefined') {
                wiz.setMetaProp('ps', session);
                wiz.setMetaProp('cs', session);
                wiz.setMetaProp('sc', 1);
            }
            //not same as session in local storage. new session
            else if (currentSessionInLS != session) {
                wiz.setMetaProp('ps', currentSessionInLS);
                wiz.setMetaProp('cs', session);
                var sessionCount = wiz.getMetaProp('sc');
                if (typeof sessionCount == 'undefined') {
                    sessionCount = 0;
                }
                wiz.setMetaProp('sc', sessionCount + 1);
            }
            currentSessionId = session;
        }
    };


    // call back function used to store global and session ids for the user
    //resume - this is used to signal that we can resume sending events to server
    // was waiting for the server to reset the cookie. everything was getting written to cookie
    wiz.s = function (global, session, resume, respNumber) {
        if (typeof respNumber === "undefined") {
            respNumber = 0;
        }
        if (respNumber > REQ_N) {
            //request for some other user so ignore
            return;
        }

        if (resume) {
            resetCookie = false;
        }
        if (wzrk_util.isLocalStorageSupported()) {
            wiz.manageSession(session);
        }
        // global cookie
        var TEN_YEARS_IN_SECS = 86400 * 365 * 10; //seconds in an days * days in an year * number of years
        var cookieExpiry = TEN_YEARS_IN_SECS;
        gcookie = global;

        wiz.createBroadCookie(GCOOKIE_NAME, global, cookieExpiry, domain);

        if (wzrk_util.isLocalStorageSupported()) {  //write to HTML 5 localstorage
            try {
                localStorage[GCOOKIE_NAME] = global;
            } catch (e) {
                wc.e("Unable to write to local storage: " + e);
            }
        }
        // global cookie

        // session cookie
        var obj = wiz.getSessionCookieObject();

        // for the race-condition where two responses come back with different session ids. don't write the older session id.
        if (typeof obj["s"] == "undefined" || obj["s"] <= session) {
            obj["s"] = session;
            obj["t"] = wzrk_util.getNow();  // time of last response from server
            wiz.setSessionCookieObject(obj);
        }
        // session cookie

        // the above global cookie creation guarantees that we know the broad domain
        wiz.deleteCookie(LCOOKIE_NAME, broadDomain);
        wc.d("del ck: " + LCOOKIE_NAME);
        if (resume) {
            wiz.pushOutStaleEvents();
        }

        RESP_N = respNumber;

    };


    // sets cookie on the base domain. e.g. if domain is baz.foo.bar.com, set cookie on ".bar.com"
    wiz.createBroadCookie = function (name, value, seconds, domain) {


        //To update an existing "broad domain" cookie, we need to know what domain it was actually set on.
        //since a retrieved cookie never tells which domain it was set on, we need to set another test cookie
        //to find out which "broadest" domain the cookie was set on. Then delete the test cookie, and use that domain
        //for updating the actual cookie.


        if (domain) {
            if (typeof broadDomain == 'undefined') {  // if we don't know the broadDomain yet, then find out
                var domainParts = domain.split(".");
                var testBroadDomain = "";
                for (var idx = domainParts.length - 1; idx >= 0; idx--) {
                    testBroadDomain = "." + domainParts[idx] + testBroadDomain;

                    // only needed if the cookie already exists and needs to be updated. See note above.
                    if (wiz.readCookie(name)) {

                        // no guarantee that browser will delete cookie, hence create short lived cookies
                        var testCookieName = "test_" + name + idx;
                        wiz.createCookie(testCookieName, value, 10, testBroadDomain); // self-destruct after 10 seconds
                        if (!wiz.readCookie(testCookieName)) {  // if test cookie not set, then the actual cookie wouldn't have been set on this domain either.
                            continue;
                        } else {                                // else if cookie set, then delete the test and the original cookie
                            wiz.deleteCookie(testCookieName, testBroadDomain);
                        }
                    }

                    wiz.createCookie(name, value, seconds, testBroadDomain);
                    var tempCookie = wiz.readCookie(name);
                    if (tempCookie == value) {
                        broadDomain = testBroadDomain;
                        //wc.d("Was able to retrieve cookie on: " + testBroadDomain + "->" + name + "=" + tempCookie);
                        break;
                    }
                }
            } else {
                wiz.createCookie(name, value, seconds, broadDomain);
            }
        } else {
            wiz.createCookie(name, value, seconds, domain);
        }
    };

    //read  - cookie get-set: http://www.quirksmode.org/js/cookies.html

    wiz.createCookie = function (name, value, seconds, domain) {
        var expires = "";
        var domainStr = "";
        if (seconds) {
            var date = new Date();
            date.setTime(date.getTime() + (seconds * 1000));

            expires = "; expires=" + date.toGMTString();
        }

        if (domain) {
            domainStr = "; domain=" + domain;
        }

        value = encodeURIComponent(value);

        var cookieStr = name + "=" + value + expires + domainStr + "; path=/";
        document.cookie = cookieStr;
    };

    wiz.readCookie = function readCookie(name) {
        var nameEQ = name + "=";
        var ca = document.cookie.split(';');
        for (var idx = 0; idx < ca.length; idx++) {
            var c = ca[idx];
            while (c.charAt(0) == ' ') {
                c = c.substring(1, c.length);
            }
            if (c.indexOf(nameEQ) == 0) {
                return decodeURIComponent(c.substring(nameEQ.length, c.length));
            }
        }
        return null;
    };

    wiz.deleteCookie = function (name, domain) {
        var cookieStr = name + '=; expires=Thu, 01 Jan 1970 00:00:01 GMT;';

        if (domain) {
            cookieStr = cookieStr + " domain=" + domain + "; path=/";
        }

        document.cookie = cookieStr;
    };


    wiz.addToURL = function (url, k, v) {
        return url + "&" + k + "=" + encodeURIComponent(v);
    };

    var MAX_TRIES = 50;

    var fireRequest = function (url, tries) {
        if (gcookie == null && RESP_N < REQ_N && tries < MAX_TRIES) {
            setTimeout(function () {
                fireRequest(url, tries + 1);
            }, 50);
            return;
        }

        if (gcookie != null) {
            //add cookie to url
            url = wiz.addToURL(url, "gc", gcookie);
        }
        url = wiz.addARPToRequest(url);
        url = wiz.addToURL(url, "r", new Date().getTime()); // add epoch to beat caching of the URL
        url = wiz.addToURL(url, "rn", ++REQ_N);
        if (wizrocket.hasOwnProperty("plugin")) { //used to add plugin name in request parameter
            var plugin = wizrocket["plugin"];
            url = wiz.addToURL(url, "ct_pl", plugin);
        }
        if (url.indexOf("chrome-extension:") != -1) {
            url = url.replace('chrome-extension:', 'https:');
        }
        var s = doc.createElement('script');
        s.setAttribute("type", "text/javascript");
        s.setAttribute("src", url);
        s.setAttribute("rel", "nofollow");
        s.async = true;
        doc.getElementsByTagName("head")[0].appendChild(s);
        wc.d("req snt -> url: " + url);
    };

    wiz.fireRequest = function (url) {
        fireRequest(url, 1);
    };

    wiz.closeIframe = function (campaignId, divId) {
        if (typeof campaignId != 'undefined' && campaignId != '-1') {
            if (wzrk_util.isSessionStorageSupported()) {
                var campIds = sessionStorage[CAMP_COOKIE_NAME];
                if (typeof campIds == 'undefined') {
                    campIds = {};
                } else {
                    campIds = JSON.parse(decodeURIComponent(campIds).replace(singleQuoteRegex, "\""))
                }
                campIds[campaignId] = 'dnd';
                var campObj = JSON.stringify(campIds);
                sessionStorage[CAMP_COOKIE_NAME] = encodeURIComponent(campObj);
            }
        }
        document.getElementById(divId).style.display = "none";
    };

    // helper variable to handle race condition and check when notifications were called
    var notifApi = {};
    notifApi.notifEnabledFromApi = false;

    /**
     * Function is exposed to customer; called as needed after specific events to set up push notifications
     * @param displayArgs array: [titleText, bodyText, okButtonText, rejectButtonText]
     */
    wiz.setUpWebPush = function (displayArgs) {
        if (webPushEnabled && displayArgs.length > 0) {
            wiz.handleNotificationRegistration(displayArgs);
        } else if (typeof webPushEnabled === 'undefined' && displayArgs.length > 0) {
            notifApi.notifEnabledFromApi = true;
            notifApi.displayArgs = displayArgs.slice();
        } else if (webPushEnabled === false) {
            wc.e('Make sure push notifications are fully enabled and integrated');
        }

    };


    wiz.handleNotificationRegistration = function (displayArgs) {

        // make sure everything is specified
        var titleText;
        var bodyText;
        var okButtonText;
        var rejectButtonText;
        var okButtonColor;
        var skipDialog;
        var askAgainTimeInSeconds;

        if(displayArgs.length === 1){
            if(wzrk_util.isObject(displayArgs[0])){
                var notifObj = displayArgs[0];
                titleText = notifObj["titleText"];
                bodyText = notifObj["bodyText"];
                okButtonText = notifObj["okButtonText"];
                rejectButtonText = notifObj["rejectButtonText"];
                okButtonColor = notifObj["okButtonColor"];
                skipDialog = notifObj["skipDialog"];
                askAgainTimeInSeconds = notifObj["askAgainTimeInSeconds"];
            }
        } else{
            titleText = displayArgs[0];
            bodyText = displayArgs[1];
            okButtonText = displayArgs[2];
            rejectButtonText = displayArgs[3];
            okButtonColor = displayArgs[4];
            skipDialog = displayArgs[5];
            askAgainTimeInSeconds = displayArgs[6]
        }

        if(typeof skipDialog === "undefined"){
            skipDialog = false;
        }

        // ensure that the browser supports notifications
        if (typeof navigator["serviceWorker"] === "undefined") {
            return;
        }

        // make sure the site is on https for chrome notifications
        if (location.protocol !== 'https:' && document.location.hostname !== 'localhost') {
            wc.e("Make sure you are https or localhost to register for notifications");
            return;
        }

        // right now, we only support chrome v50 or higher
        if (navigator.userAgent.indexOf('Chrome') !== -1) {
            var chromeAgent = navigator.userAgent.match(/Chrome\/(\d+)/);
            if (typeof chromeAgent === 'undefined' || parseInt(chromeAgent[1], 10) < 50)
                return;
        } else {
            return;
        }

        // we check for the cookie in setUpChromeNotifications(); the tokens may have changed

        // handle migrations from other services -> chrome notifications may have already been asked for before
        if (Notification.permission === 'granted') {
            // skip the dialog and register
            wiz.setUpChromeNotifications();
            return;
        } else if (Notification.permission === 'denied') {
            // we've lost this profile :'(
            return;
        }

        // make sure the user isn't asked for notifications more than twice in one weeks
        if (typeof(wiz.getMetaProp('notif_last_time')) === 'undefined') {
            wiz.setMetaProp('notif_last_time', new Date().getTime() / 1000);
        } else {
            var now = new Date().getTime() / 1000;
            if(typeof askAgainTimeInSeconds !== "undefined"){
                var ASK_TIME_IN_SECONDS = askAgainTimeInSeconds;
            } else{
                // 7 days by default
                var ASK_TIME_IN_SECONDS = 7 * 24 * 60 * 60;
            }

            if (now - wiz.getMetaProp('notif_last_time') < ASK_TIME_IN_SECONDS) {
                return;
            } else {
                // continue asking
                wiz.setMetaProp('notif_last_time', now);
            }
        }

        if(skipDialog){
            wiz.setUpChromeNotifications();
            return;
        }

        // make sure the right parameters are passed
        if (!titleText || !bodyText || !okButtonText || !rejectButtonText) {
            wc.e('Missing input parameters; please specify title, body, ok button and cancel button text');
            return;
        }

        // make sure okButtonColor is formatted properly
        if (typeof okButtonColor === 'undefined' || !okButtonColor.match(/^#[a-f\d]{6}$/i)) {
            okButtonColor = "#f28046"; // default color for positive button
        }

        wiz.addWizAlertJS().onload = function () {
            // create our wizrocket popup
            wizAlert({
                'title': titleText,
                'body': bodyText,
                'confirmButtonText': okButtonText,
                'confirmButtonColor': okButtonColor,
                'rejectButtonText': rejectButtonText
            }, function (enabled) { // callback function
                if (enabled) {
                    // the user accepted on the dialog box
                    wiz.setUpChromeNotifications();
                }
                wiz.removeWizAlertJS();
            });
        }
    };

    wiz.tr = function (msg) {

        var doCampHouseKeeping = function (targetingMsgJson) {
            //var targetingMsgJson = msg['inapp_notifs'][0];
            var campaignId = targetingMsgJson['wzrk_id'].split('_')[0];
            var campIds = {};
            //use session storage if available
            if (wzrk_util.isSessionStorageSupported()) {
                campIds = sessionStorage[CAMP_COOKIE_NAME];
                if (typeof campIds == 'undefined') {
                    campIds = {};
                } else {
                    campIds = JSON.parse(decodeURIComponent(campIds).replace(singleQuoteRegex, "\""))

                }
            } else {//read from cookie
                campIds = wiz.readCookie(CAMP_COOKIE_NAME);
                if (campIds == "t") {
                    return false;
                }
            }
            if (campIds == null) {
                campIds = {};
            }
            //global session limit. default is 1
            if (typeof targetingMsgJson['display']['wmc'] == 'undefined') {
                targetingMsgJson['display']['wmc'] = 1;
            }
            //check if total limit exceeded per session
            if (typeof campIds != 'undefined' && campIds['wmc'] != 'undefined' && campIds['wmc'] >= targetingMsgJson['display']['wmc']) {
                return false;
            }
            //check if target limit exceeded per session
            if (typeof campIds != 'undefined' && typeof campIds[campaignId] != 'undefined' && (campIds[campaignId] == 'dnd' || campIds[campaignId] >= targetingMsgJson['display']['mdc'])) {
                return false;
            }

            //delay
            if (typeof targetingMsgJson['display']['delay'] != 'undefined' && targetingMsgJson['display']['delay'] > 0) {
                var delay = targetingMsgJson['display']['delay'];
                targetingMsgJson['display']['delay'] = 0;
                setTimeout(wiz.tr, delay * 1000, msg);
                return false;
            }

            //update campaign count
            if (typeof campIds[campaignId] == 'undefined') {
                campIds[campaignId] = 1;
            } else {
                campIds[campaignId]++;
            }

            //updating global counts
            if (typeof campIds['wmc'] == 'undefined') {
                campIds['wmc'] = 1;
            } else {
                campIds['wmc']++;
            }

            var campObj = encodeURIComponent(JSON.stringify(campIds));
            //use session storage if available
            if (wzrk_util.isSessionStorageSupported()) {
                sessionStorage[CAMP_COOKIE_NAME] = campObj;
            } else {//read cookie
                wiz.createCookie(CAMP_COOKIE_NAME, "t", 0, domain);
            }
        };

        var getCookieParams = function () {
            if (gcookie == null) {
                if (wzrk_util.isLocalStorageSupported()) { // only get from localStorage if cookie is null
                    gcookie = localStorage[GCOOKIE_NAME];
                } else {
                    gcookie = wiz.readCookie(GCOOKIE_NAME);
                }
            }
            if (scookieObj == null) {
                scookieObj = wiz.getSessionCookieObject();
            }
            return '&t=wc&d=' + encodeURIComponent(LZS.compressToBase64(gcookie + '|' + scookieObj['p'] + '|' + scookieObj['s']));
        };

        var setupClickEvent = function (onClick, targetingMsgJson, contentDiv, divId) {
            if (onClick != '' && typeof onClick != 'undefined') {
                var jsFunc = targetingMsgJson['display']['jsFunc'];
                onClick += getCookieParams();
                contentDiv.onclick =
                    function () {
                        //invoke js function call
                        if (typeof jsFunc != 'undefined') {
                            //track notification clicked event
                            wiz.fireRequest(onClick);
                            invokeExternalJs(jsFunc, targetingMsgJson);
                            //close iframe. using -1 for no campaignId
                            wiz.closeIframe('-1', divId);
                            return;
                        }
                        //pass on the gcookie|page|scookieId for capturing the click event
                        if (targetingMsgJson['display']['window'] == '1') {
                            window.open(onClick, '_blank');
                        } else {
                            window.location = onClick;
                        }
                    }
            }
        };

        var invokeExternalJs = function (jsFunc, targetingMsgJson) {
            var func = window.parent[jsFunc];
            if (typeof func == "function") {
                if (typeof targetingMsgJson['display']['kv'] !== 'undefined') {
                    func(targetingMsgJson['display']['kv']);
                } else {
                    func();
                }
            }
        };

        var setupClickUrl = function (onClick, targetingMsgJson, contentDiv, divId) {
            incrementImpression(targetingMsgJson);
            setupClickEvent(onClick, targetingMsgJson, contentDiv, divId);
        };

        var incrementImpression = function (targetingMsgJson) {
            var campaignId = parseInt(targetingMsgJson['wzrk_id'].split('_')[0], 10);
            var batchId = parseInt(targetingMsgJson['wzrk_id'].split('_')[1], 10);
            var accountId = wizrocket['account'][0]['id'];
            var targetCountReq = targetCountURL;
            var data = {};
            data['cId'] = campaignId;
            data['bId'] = batchId;
            data['accId'] = accountId;
            data['d'] = "Web";
            data['m'] = "Web";
            targetCountReq = wiz.addToURL(targetCountReq, "d", wiz.compressData(JSON.stringify(data)));
            wiz.fireRequest(targetCountReq);
        };

        var renderFooterNotification = function (targetingMsgJson) {
            var campaignId = targetingMsgJson['wzrk_id'].split('_')[0];

            var msgDiv = document.createElement('div');
            msgDiv.id = 'wizParDiv';
            var viewHeight = window.innerHeight;
            var viewWidth = window.innerWidth;

            var marginBottom = viewHeight * 5 / 100;
            var contentHeight = 10;
            var right = viewWidth * 5 / 100;
            var bottomPosition = contentHeight + marginBottom;
            var width = viewWidth * 30 / 100 + 20;
            //for small devices  - mobile phones
            if ((/mobile/i.test(navigator.userAgent) || (/mini/i.test(navigator.userAgent)) ) && /iPad/i.test(navigator.userAgent) == false) {
                width = viewWidth * 85 / 100 + 20;
                right = viewWidth * 5 / 100;
                bottomPosition = viewHeight * 5 / 100;
                //medium devices - tablets
            } else if ('ontouchstart' in window || (/tablet/i.test(navigator.userAgent))) {
                width = viewWidth * 50 / 100 + 20;
                right = viewWidth * 5 / 100;
                bottomPosition = viewHeight * 5 / 100;
            }


            msgDiv.setAttribute('style', 'display:block;overflow:hidden; bottom:' + bottomPosition + 'px !important;width:' + width + 'px !important;right:' + right + 'px !important;position:fixed;z-index:2147483647;');
            document.body.appendChild(msgDiv);
            var iframe = document.createElement('iframe');

            iframe['frameborder'] = '0px';
            iframe['marginheight'] = '0px';
            iframe['marginwidth'] = '0px';
            iframe['scrolling'] = 'no';
            iframe['id'] = 'wiz-iframe';
            var onClick = targetingMsgJson['display']['onClick'];
            var pointerCss = '';
            if (onClick != '' && typeof onClick != 'undefined') {
                pointerCss = 'cursor:pointer;';
            }
            var css = '' +
                '<style type="text/css">' +
                'body{margin:0;padding:0;}' +
                '#contentDiv.wzrk{overflow:hidden;padding:0;text-align:center;' + pointerCss + '}' +
                '#contentDiv.wzrk td{padding:15px 10px;}' +
                '.wzrkPPtitle{font-weight: bold;font-size: 16px;font-family:arial;padding-bottom:10px;word-break: break-word;}' +
                '.wzrkPPdscr{font-size: 14px;font-family:arial;line-height:16px;word-break: break-word;display:inline-block;}' +
                '.PL15{padding-left:15px;}' +
                '.wzrkPPwarp{margin:20px 20px 0 5px;padding:0px;border-radius: 8px;box-shadow: 1px 1px 5px #888888;}' +
                'a.wzrkClose{cursor:pointer;position: absolute;top: 11px;right: 11px;z-index: 2147483647;font-size:19px;font-family:arial;font-weight:bold;text-decoration: none;width: 25px;/*height: 25px;*/text-align: center; -webkit-appearance: none; line-height: 25px;' +
                'background: #353535;border: #fff 2px solid;border-radius: 100%;box-shadow: #777 2px 2px 2px;color:#fff;}' +
                'a:hover.wzrkClose{background-color:#d1914a !important;color:#fff !important; -webkit-appearance: none;}' +
                'td{vertical-align:top;}' +
                'td.imgTd{border-top-left-radius:8px;border-bottom-left-radius:8px;}' +
                '</style>';

            var bgColor;
            if (targetingMsgJson['display']['theme'] == 'dark') {
                bgColor = "#2d2d2e";
                textColor = "#eaeaea";
                btnBg = '#353535';
                leftTd = '#353535';
                btColor = '#ffffff';
            } else {
                bgColor = "#ffffff";
                textColor = "#000000";
                leftTd = '#f4f4f4';
                btnBg = '#a5a6a6';
                btColor = '#ffffff';
            }

            //direct html
            if (targetingMsgJson['msgContent']['type'] == 1) {
                iframe.src = targetingMsgJson['msgContent']['html'];
                msgDiv.appendChild(iframe);
                return;
            }

            var titleText = targetingMsgJson['msgContent']['title'];
            var descriptionText = targetingMsgJson['msgContent']['description'];
            var imageTd = "";
            if (typeof targetingMsgJson['msgContent']['imageUrl'] != 'undefined' && targetingMsgJson['msgContent']['imageUrl'] != '') {
                imageTd = "<td class='imgTd' style='background-color:" + leftTd + "'><img src='" + targetingMsgJson['msgContent']['imageUrl'] + "' height='60' width='60'></td>";
            }
            var onClickStr = "parent.$WZRK_WR.closeIframe(" + campaignId + ",'wizParDiv');";
            var title = "<div class='wzrkPPwarp' style='color:" + textColor + ";background-color:" + bgColor + ";'>" +
                "<a href='javascript:void(0);' onclick=" + onClickStr + " class='wzrkClose' style='background-color:" + btnBg + ";color:" + btColor + "'>&times;</a>" +
                "<div id='contentDiv' class='wzrk'>" +
                "<table cellpadding='0' cellspacing='0' border='0'>" +
                    //"<tr><td colspan='2'></td></tr>"+
                "<tr>" + imageTd + "<td style='vertical-align:top;'>" +
                "<div class='wzrkPPtitle' style='color:" + textColor + "'>" + titleText + "</div>";
            var body = "<div class='wzrkPPdscr' style='color:" + textColor + "'>" + descriptionText + "<div></td></tr></table></div>";
            var html = css + title + body;

            iframe.setAttribute('style', 'z-index: 2147483647; display:block; width: 100% !important; border:0px !important; border-color:none !important;');
            msgDiv.appendChild(iframe);
            var ifrm = (iframe.contentWindow) ? iframe.contentWindow : (iframe.contentDocument.document) ? iframe.contentDocument.document : iframe.contentDocument;
            var doc = ifrm.document;

            doc.open();
            doc.write(html);
            doc.close();
            //adjust iframe and body height of html inside correctly
            contentHeight = document.getElementById("wiz-iframe").contentDocument.getElementById('contentDiv').scrollHeight + 26;
            document.getElementById("wiz-iframe").contentDocument.body.style.margin = "0px";
            document.getElementById("wiz-iframe").style.height = contentHeight + "px";
            return document.getElementById("wiz-iframe").contentDocument.getElementById('contentDiv');
        };

        var _callBackCalled = false;

        var showFooterNotification = function (targetingMsgJson) {
            if (document.getElementById("wizParDiv") != null) {
                return;
            }
            if (doCampHouseKeeping(targetingMsgJson) == false) {
                return;
            }
            var onClick = targetingMsgJson['display']['onClick'];
            if (wizrocket.hasOwnProperty("notificationCallback") &&
                typeof wizrocket["notificationCallback"] !== "undefined" &&
                typeof wizrocket["notificationCallback"] === "function") {
                var notificationCallback = wizrocket["notificationCallback"];
                if (!_callBackCalled) {
                    var inaObj = {};
                    inaObj["msgContent"] = targetingMsgJson["msgContent"];
                    inaObj["msgId"] = targetingMsgJson["wzrk_id"];
                    if (typeof targetingMsgJson['display']['kv'] !== 'undefined') {
                        inaObj["kv"] = targetingMsgJson['display']['kv'];
                    }
                    wizrocket["raiseNotificationClicked"] = function () {
                        if (onClick != '' && typeof onClick != 'undefined') {
                            var jsFunc = targetingMsgJson['display']['jsFunc'];
                            onClick += getCookieParams();

                            //invoke js function call
                            if (typeof jsFunc != 'undefined') {
                                //track notification clicked event
                                wiz.fireRequest(onClick);
                                invokeExternalJs(jsFunc, targetingMsgJson);
                                return;
                            }
                            //pass on the gcookie|page|scookieId for capturing the click event
                            if (targetingMsgJson['display']['window'] == '1') {
                                window.open(onClick, '_blank');
                            } else {
                                window.location = onClick;
                            }
                        }
                    };
                    wizrocket["raiseNotificationViewed"] = function () {
                        incrementImpression(targetingMsgJson);
                    };
                    notificationCallback(inaObj);
                    _callBackCalled = true;
                }
            } else {
                var contentDiv = renderFooterNotification(targetingMsgJson);
                setupClickUrl(onClick, targetingMsgJson, contentDiv, 'wizParDiv');
            }
        };
        var exitintentObj;
        var showExitIntent = function () {
            var targetingMsgJson = exitintentObj;
            if (document.getElementById("intentPreview") != null) {
                return;
            }
            //not desktop
            if ((/mobile/i.test(navigator.userAgent)) || (/mini/i.test(navigator.userAgent)) || (/iPad/i.test(navigator.userAgent)) ||
                ('ontouchstart' in window) || (/tablet/i.test(navigator.userAgent))) {
                return;
            }


            var campaignId = targetingMsgJson['wzrk_id'].split('_')[0];
            if (doCampHouseKeeping(targetingMsgJson) == false) {
                return;
            }
            var msgDiv = document.createElement('div');
            msgDiv.id = 'intentPreview';
            var viewHeight = window.innerHeight;
            var viewWidth = window.innerWidth;
            msgDiv.setAttribute('style', 'display:block;overflow:hidden;top:55% !important;left:50% !important;position:fixed;z-index:2147483647;width:600px !important;height:600px !important;margin:-300px 0 0 -300px !important;');
            document.body.appendChild(msgDiv);
            var iframe = document.createElement('iframe');

            iframe.frameborder = '0px';
            iframe.marginheight = '0px';
            iframe.marginwidth = '0px';
            iframe.scrolling = 'no';
            iframe.id = 'wiz-iframe-intent';
            var onClick = targetingMsgJson['display']['onClick'];
            var pointerCss = '';
            if (onClick != '' && typeof onClick != 'undefined') {
                pointerCss = 'cursor:pointer;';
            }
            var css = '' +
                '<style type="text/css">' +
                'body{margin:0;padding:0;}' +
                '#contentDiv.wzrk{overflow:hidden;padding:0 0 20px 0;text-align:center;' + pointerCss + '}' +
                '#contentDiv.wzrk td{padding:15px 10px;}' +
                '.wzrkPPtitle{font-weight: bold;font-size: 24px;font-family:arial;word-break: break-word;padding-top:20px;}' +
                '.wzrkPPdscr{font-size: 14px;font-family:arial;line-height:16px;word-break: break-word;display:inline-block;padding:20px 20px 0 20px;line-height:20px;}' +
                '.PL15{padding-left:15px;}' +
                '.wzrkPPwarp{margin:20px 20px 0 5px;padding:0px;border-radius: 8px;box-shadow: 1px 1px 5px #888888;}' +
                'a.wzrkClose{cursor:pointer;position: absolute;top: 11px;right: 11px;z-index: 2147483647;font-size:19px;font-family:arial;font-weight:bold;text-decoration: none;width: 25px;/*height: 25px;*/text-align: center; -webkit-appearance: none; line-height: 25px;' +
                'background: #353535;border: #fff 2px solid;border-radius: 100%;box-shadow: #777 2px 2px 2px;color:#fff;}' +
                'a:hover.wzrkClose{background-color:#d1914a !important;color:#fff !important; -webkit-appearance: none;}' +
                '#contentDiv .button{padding-top:20px;}' +
                '#contentDiv .button a{font-size: 14px;font-weight:bold;font-family:arial;text-align:center;display:inline-block;text-decoration:none;padding:0 30px;height:40px;line-height:40px;background:#ea693b;color:#fff;border-radius:4px;-webkit-border-radius:4px;-moz-border-radius:4px;}' +
                '</style>';

            var bgColor;
            if (targetingMsgJson['display']['theme'] == 'dark') {
                bgColor = "#2d2d2e";
                textColor = "#eaeaea";
                btnBg = '#353535';
                btColor = '#ffffff';
            } else {
                bgColor = "#ffffff";
                textColor = "#000000";
                btnBg = '#a5a6a6';
                btColor = '#ffffff';
            }
            var titleText = targetingMsgJson['msgContent']['title'];
            var descriptionText = targetingMsgJson['msgContent']['description'];
            var ctaText = "";
            if (typeof targetingMsgJson['msgContent']['ctaText'] != 'undefined' && targetingMsgJson['msgContent']['ctaText'] != '') {
                ctaText = "<div class='button'><a href='#'>" + targetingMsgJson['msgContent']['ctaText'] + "</a></div>";
            }

            var imageTd = "";
            if (typeof targetingMsgJson['msgContent']['imageUrl'] != 'undefined' && targetingMsgJson['msgContent']['imageUrl'] != '') {
                imageTd = "<div style='padding-top:20px;'><img src='" + targetingMsgJson['msgContent']['imageUrl'] + "' width='500' alt=" + titleText + " /></div>";
            }
            var onClickStr = "parent.$WZRK_WR.closeIframe(" + campaignId + ",'intentPreview');";
            var title = "<div class='wzrkPPwarp' style='color:" + textColor + ";background-color:" + bgColor + ";'>" +
                "<a href='javascript:void(0);' onclick=" + onClickStr + " class='wzrkClose' style='background-color:" + btnBg + ";color:" + btColor + "'>&times;</a>" +
                "<div id='contentDiv' class='wzrk'>" +
                "<div class='wzrkPPtitle' style='color:" + textColor + "'>" + titleText + "</div>";
            var body = "<div class='wzrkPPdscr' style='color:" + textColor + "'>" + descriptionText + "</div>" + imageTd + ctaText +
                "</div></div>";
            var html = css + title + body;
            iframe.setAttribute('style', 'z-index: 2147483647; display:block; height: 100% !important; width: 100% !important;min-height:80px !important;border:0px !important; border-color:none !important;');
            msgDiv.appendChild(iframe);
            var ifrm = (iframe.contentWindow) ? iframe.contentWindow : (iframe.contentDocument.document) ? iframe.contentDocument.document : iframe.contentDocument;
            var doc = ifrm.document;

            doc.open();
            doc.write(html);
            doc.close();
            var contentDiv = document.getElementById("wiz-iframe-intent").contentDocument.getElementById('contentDiv');
            setupClickUrl(onClick, targetingMsgJson, contentDiv, 'intentPreview');


        };


        if (!document.body) {
            if (wiz_counter < 6) {
                wiz_counter++;
                setTimeout(wiz.tr, 1000, msg);
            }
            return;
        }
        if (typeof msg['inapp_notifs'] != 'undefined') {
            for (var index = 0; index < msg['inapp_notifs'].length; index++) {
                var target_notif = msg['inapp_notifs'][index];
                if (typeof target_notif['display']['wtarget_type'] == 'undefined' || target_notif['display']['wtarget_type'] == 0) {
                    showFooterNotification(target_notif);
                } else if (target_notif['display']['wtarget_type'] == 1) { 	// if display['wtarget_type']==1 then exit intent
                    exitintentObj = target_notif;
                    window.document.body.onmouseleave = showExitIntent;
                }

            }
        }

        var mergeEventMap = function (newEvtMap) {
            if (typeof globalEventsMap == 'undefined') {
                globalEventsMap = wiz.readFromLSorCookie(EV_COOKIE);
                if (typeof globalEventsMap == 'undefined') {
                    globalEventsMap = newEvtMap;
                    return;
                }
            }
            for (var key in newEvtMap) {
                if (newEvtMap.hasOwnProperty(key)) {
                    var oldEvtObj = globalEventsMap[key];
                    var newEvtObj = newEvtMap[key];
                    if (typeof globalEventsMap[key] != 'undefined') {
                        if (typeof newEvtObj[0] != 'undefined' && newEvtObj[0] > oldEvtObj[0]) {
                            globalEventsMap[key] = newEvtObj;
                        }
                    } else {
                        globalEventsMap[key] = newEvtObj;
                    }
                }
            }
        };


        if (wzrk_util.isLocalStorageSupported()) {
            try {
                if (typeof msg['evpr'] != 'undefined') {
                    var eventsMap = msg['evpr']['events'];
                    var profileMap = msg['evpr']['profile'];
                    var syncExpiry = msg['evpr']['expires_in'];
                    var now = wzrk_util.getNow();
                    wiz.setMetaProp('lsTime', now);
                    wiz.setMetaProp('exTs', syncExpiry);
                    mergeEventMap(eventsMap);
                    wiz.saveToLSorCookie(EV_COOKIE, globalEventsMap);
                    if (typeof globalProfileMap == 'undefined') {
                        wiz.addToLocalProfileMap(profileMap, true);
                    } else {
                        wiz.addToLocalProfileMap(profileMap, false);
                    }
                }
                if (typeof msg['arp'] != 'undefined') {
                    wiz.arp(msg['arp']);
                }
            } catch (e) {
                wc.e("Unable to persist evrp/arp: " + e);
            }
        }
    };

    //link - actual link, type could be - "ctr" or "view"
    wiz.getWrappedLink = function (link, targetId, type) {

        var data = {};
        data['sendTo'] = link;
        data['targetId'] = targetId;
        data['epoch'] = wzrk_util.getNow();

        if (type != null) {
            data['type'] = type;
        } else {
            data['type'] = 'view';
        }

        data = wiz.addSystemDataToObject(data);
        return wiz.addToURL(recorderURL, "d", wiz.compressData(JSON.stringify(data)));

    };


    wiz.getMessageTemplate = function () {
        var body = "";
        body = body + '<div class="notice-message">';
        body = body + '  <a href="[RECORDER_HREF]" class="box">';
        body = body + '    <div class="avatar"><span class="fa [ICON] fa-4x fa-fw"></span></div>';
        body = body + '    <div class="info">';
        body = body + '      <div class="title">[TITLE]</div>';
        body = body + '      <div class="clearfix"></div>';
        body = body + '      <div class="text">[TEXT]</div>';
        body = body + '    </div>';
        body = body + '    <div class="clearfix"></div>';
        body = body + '  </a>';
        body = body + '</div>';
        body = body + '<div class="clearfix"></div>';
        return body;
    };

    wiz.getMessageHeadTemplate = function () {
        var head = '<head>';
        head = head + '<base target="_parent" />';
        head = head + '<link rel="stylesheet" href="http://static.clevertap.com/fa/font-awesome.css">';
        head = head + '<meta name="viewport" content="width=device-width, initial-scale=1.0">';
        head = head + '<style>';
        head = head + '[STYLE]';
        head = head + '</style>';
        head = head + "</head>";
        return head;

    };


    wiz.isChargedEventStructureValid = function (chargedObj) {
        if (wzrk_util.isObject(chargedObj)) {
            for (var key in chargedObj) {
                if (key == "Items") {
                    if (!wzrk_util.isArray(chargedObj[key])) {
                        return false;
                    }

                    if (chargedObj[key].length > 16) {
                        wiz.reportError(522, "Charged Items exceed 16 limit. Actual count: " + chargedObj[key].length + ". Additional items will be dropped.");
                    }

                    for (var itemKey in chargedObj[key]) {
                        if (chargedObj[key].hasOwnProperty(itemKey)) {    // since default array implementation could be overridden - e.g. Teabox site
                            if (!wzrk_util.isObject(chargedObj[key][itemKey]) || !wiz.isEventStructureFlat(chargedObj[key][itemKey])) {
                                return false;
                            }
                        }
                    }
                } else { //Items
                    if (wzrk_util.isObject(chargedObj[key]) || wzrk_util.isArray(chargedObj[key])) {
                        return false;
                    } else if (wzrk_util.isDateObject(chargedObj[key])) {
                        chargedObj[key] = wzrk_util.convertToWZRKDate(chargedObj[key]);
                    }

                } // if key == Items

            } //for..
            return true;
        } // if object (chargedObject)
        return false;
    };


    //events can't have any nested structure or arrays
    wiz.isEventStructureFlat = function (eventObj) {
        if (wzrk_util.isObject(eventObj)) {
            for (var key in eventObj) {
                if (wzrk_util.isObject(eventObj[key]) || wzrk_util.isArray(eventObj[key])) {
                    return false;
                } else if (wzrk_util.isDateObject(eventObj[key])) {
                    eventObj[key] = wzrk_util.convertToWZRKDate(eventObj[key]);
                }

            }
            return true;
        }
        return false;

    };

    wiz.isProfileValid = function (profileObj) {

        if (wzrk_util.isObject(profileObj)) {
            for (var profileKey in profileObj) {
                if (profileObj.hasOwnProperty(profileKey)) {
                    var valid = true;
                    var profileVal = profileObj[profileKey];

                    if (typeof profileVal == 'undefined') {
                        delete profileObj[profileKey];
                        continue;
                    }
                    if (profileKey == 'Gender' && !profileVal.match(/^M$|^F$/)) {
                        valid = false;
                        wc.e(wzrk_msg['gender-error']);
                    }

                    if (profileKey == 'Employed' && !profileVal.match(/^Y$|^N$/)) {
                        valid = false;
                        wc.e(wzrk_msg['employed-error']);
                    }

                    if (profileKey == 'Married' && !profileVal.match(/^Y$|^N$/)) {
                        valid = false;
                        wc.e(wzrk_msg['married-error']);
                    }

                    if (profileKey == 'Education' && !profileVal.match(/^School$|^College$|^Graduate$/)) {
                        valid = false;
                        wc.e(wzrk_msg['education-error']);
                    }

                    if (profileKey == 'Age' && typeof profileVal != 'undefined') {
                        if (wzrk_util.isConvertibleToNumber(profileVal)) {
                            profileObj['Age'] = +profileVal;
                        } else {
                            valid = false;
                            wc.e(wzrk_msg['age-error']);
                        }
                    }

                    // dob will come in like this - $dt_19470815 or dateObject
                    if (profileKey == 'DOB') {
                        if (((!(/^\$D_/).test(profileVal) || (profileVal + "").length != 11)) && !wzrk_util.isDateObject(profileVal)) {
                            valid = false;
                            wc.e(wzrk_msg['dob-error']);
                        }

                        if (wzrk_util.isDateObject(profileVal)) {
                            var year = profileVal.getUTCFullYear();
                            var month = '' + (profileVal.getUTCMonth() + 1);
                            var date = '' + profileVal.getUTCDate();
                            if (month.length == 1) {
                                month = "0" + month;
                            }
                            if (date.length == 1) {
                                date = "0" + date;
                            }
                            profileObj['DOB'] = $WZRK_WR.setDate(year + '' + month + '' + date);
                        }
                    } else if (wzrk_util.isDateObject(profileVal)) {
                        profileObj[profileKey] = wzrk_util.convertToWZRKDate(profileVal);
                    }

                    if (profileKey == 'Phone' && !wzrk_util.isObjectEmpty(profileVal)) {
                        if (profileVal.length > 8 && (profileVal.charAt(0) == '+')) { // valid phone number
                            profileVal = profileVal.substring(1, profileVal.length);
                            if (wzrk_util.isConvertibleToNumber(profileVal)) {
                                profileObj['Phone'] = +profileVal;
                            } else {
                                valid = false;
                                wc.e(wzrk_msg['phone-format-error'] + ". Removed.");
                            }
                        } else {
                            valid = false;
                            wc.e(wzrk_msg['phone-format-error'] + ". Removed.");
                        }
                    }


                    if (!valid) {
                        delete profileObj[profileKey];
                    }
                }
            }

        }

        return valid;
    }; //isProfileValid

    wiz.setDate = function (dt) {
        return wzrk_util.setDate(dt);
    };

    wiz.setEnum = function (enumVal) {
        if (wzrk_util.isString(enumVal) || wzrk_util.isNumber(enumVal)) {
            return "$E_" + enumVal;
        }
        wc.e(wzrk_msg['enum-format-error']);
    };

    // list of functions that the closure compiler shouldn't rename
    // https://developers.google.com/closure/compiler/docs/api-tutorial3
    wiz['s'] = wiz.s;
    wiz['is_onloadcalled'] = wiz.is_onloadcalled;
    wiz['setDate'] = wiz.setDate;
    wiz['enableWebPush'] = wiz.enableWebPush; // support for web push notifications
    wiz['setEnum'] = wiz.setEnum;
    wiz['tr'] = wiz.tr;
    wiz['push'] = wiz.push;
    wiz['closeIframe'] = wiz.closeIframe;
    wiz['getEmail'] = wiz.getEmail;
    wiz['unSubEmail'] = wiz.unSubEmail;
    wiz['subEmail'] = wiz.subEmail;
    wiz['logout'] = wiz.logout;


// ---------- compression part ----------

    var LZS = {

        _f: String.fromCharCode,

        getKeyStr: function () {
            var key = "";
            var i = 0;

            for (i = 0; i <= 25; i++) {
                key = key + String.fromCharCode(i + 65);
            }

            for (i = 0; i <= 25; i++) {
                key = key + String.fromCharCode(i + 97);
            }

            for (var i = 0; i < 10; i++) {
                key = key + i;
            }

            return key + "+/=";
        },

        convertToFormattedHex: function (byte_arr) {
            var hex_str = "",
                i,
                len,
                tmp_hex;

            if (!wzrk_util.isArray(byte_arr)) {
                return false;
            }

            len = byte_arr.length;

            for (i = 0; i < len; ++i) {
                if (byte_arr[i] < 0) {
                    byte_arr[i] = byte_arr[i] + 256;
                }
                if (byte_arr[i] === undefined) {
                    byte_arr[i] = 0;
                }
                tmp_hex = byte_arr[i].toString(16);

                // Add leading zero.
                if (tmp_hex.length == 1) tmp_hex = "0" + tmp_hex;

                //        beautification - needed if you're printing this in the console, else keep commented
                //        if ((i + 1) % 16 === 0) {
                //          tmp_hex += "\n";
                //        } else {
                //          tmp_hex += " ";
                //        }

                hex_str += tmp_hex;
            }

            return hex_str.trim();
        },

        convertStringToHex: function (s) {

            var byte_arr = [];
            for (var i = 0; i < s.length; i++) {
                var value = s.charCodeAt(i);
                byte_arr.push(value & 255);
                byte_arr.push((value >> 8) & 255);
            }
            return LZS.convertToFormattedHex(byte_arr);

        },

        compressToBase64: function (input) {
            if (input == null) return "";
            var output = "";
            var chr1, chr2, chr3, enc1, enc2, enc3, enc4;
            var i = 0;

            input = LZS.compress(input);

            while (i < input.length * 2) {

                if (i % 2 == 0) {
                    chr1 = input.charCodeAt(i / 2) >> 8;
                    chr2 = input.charCodeAt(i / 2) & 255;
                    if (i / 2 + 1 < input.length)
                        chr3 = input.charCodeAt(i / 2 + 1) >> 8;
                    else
                        chr3 = NaN;
                } else {
                    chr1 = input.charCodeAt((i - 1) / 2) & 255;
                    if ((i + 1) / 2 < input.length) {
                        chr2 = input.charCodeAt((i + 1) / 2) >> 8;
                        chr3 = input.charCodeAt((i + 1) / 2) & 255;
                    } else
                        chr2 = chr3 = NaN;
                }
                i += 3;

                enc1 = chr1 >> 2;
                enc2 = ((chr1 & 3) << 4) | (chr2 >> 4);
                enc3 = ((chr2 & 15) << 2) | (chr3 >> 6);
                enc4 = chr3 & 63;

                if (isNaN(chr2)) {
                    enc3 = enc4 = 64;
                } else if (isNaN(chr3)) {
                    enc4 = 64;
                }

                output = output +
                    LZS._keyStr.charAt(enc1) + LZS._keyStr.charAt(enc2) +
                    LZS._keyStr.charAt(enc3) + LZS._keyStr.charAt(enc4);

            }

            return output;
        },


        compress: function (uncompressed) {
            if (uncompressed == null) return "";
            var i, value,
                context_dictionary = {},
                context_dictionaryToCreate = {},
                context_c = "",
                context_wc = "",
                context_w = "",
                context_enlargeIn = 2, // Compensate for the first entry which should not count
                context_dictSize = 3,
                context_numBits = 2,
                context_data_string = "",
                context_data_val = 0,
                context_data_position = 0,
                ii,
                f = LZS._f;

            for (ii = 0; ii < uncompressed.length; ii += 1) {
                context_c = uncompressed.charAt(ii);
                if (!Object.prototype.hasOwnProperty.call(context_dictionary, context_c)) {
                    context_dictionary[context_c] = context_dictSize++;
                    context_dictionaryToCreate[context_c] = true;
                }

                context_wc = context_w + context_c;
                if (Object.prototype.hasOwnProperty.call(context_dictionary, context_wc)) {
                    context_w = context_wc;
                } else {
                    if (Object.prototype.hasOwnProperty.call(context_dictionaryToCreate, context_w)) {
                        if (context_w.charCodeAt(0) < 256) {
                            for (i = 0; i < context_numBits; i++) {
                                context_data_val = (context_data_val << 1);
                                if (context_data_position == 15) {
                                    context_data_position = 0;
                                    context_data_string += f(context_data_val);
                                    context_data_val = 0;
                                } else {
                                    context_data_position++;
                                }
                            }
                            value = context_w.charCodeAt(0);
                            for (i = 0; i < 8; i++) {
                                context_data_val = (context_data_val << 1) | (value & 1);
                                if (context_data_position == 15) {
                                    context_data_position = 0;
                                    context_data_string += f(context_data_val);
                                    context_data_val = 0;
                                } else {
                                    context_data_position++;
                                }
                                value = value >> 1;
                            }
                        } else {
                            value = 1;
                            for (i = 0; i < context_numBits; i++) {
                                context_data_val = (context_data_val << 1) | value;
                                if (context_data_position == 15) {
                                    context_data_position = 0;
                                    context_data_string += f(context_data_val);
                                    context_data_val = 0;
                                } else {
                                    context_data_position++;
                                }
                                value = 0;
                            }
                            value = context_w.charCodeAt(0);
                            for (i = 0; i < 16; i++) {
                                context_data_val = (context_data_val << 1) | (value & 1);
                                if (context_data_position == 15) {
                                    context_data_position = 0;
                                    context_data_string += f(context_data_val);
                                    context_data_val = 0;
                                } else {
                                    context_data_position++;
                                }
                                value = value >> 1;
                            }
                        }
                        context_enlargeIn--;
                        if (context_enlargeIn == 0) {
                            context_enlargeIn = Math.pow(2, context_numBits);
                            context_numBits++;
                        }
                        delete context_dictionaryToCreate[context_w];
                    } else {
                        value = context_dictionary[context_w];
                        for (i = 0; i < context_numBits; i++) {
                            context_data_val = (context_data_val << 1) | (value & 1);
                            if (context_data_position == 15) {
                                context_data_position = 0;
                                context_data_string += f(context_data_val);
                                context_data_val = 0;
                            } else {
                                context_data_position++;
                            }
                            value = value >> 1;
                        }


                    }
                    context_enlargeIn--;
                    if (context_enlargeIn == 0) {
                        context_enlargeIn = Math.pow(2, context_numBits);
                        context_numBits++;
                    }
                    // Add wc to the dictionary.
                    context_dictionary[context_wc] = context_dictSize++;
                    context_w = String(context_c);
                }
            }

            // Output the code for w.
            if (context_w !== "") {
                if (Object.prototype.hasOwnProperty.call(context_dictionaryToCreate, context_w)) {
                    if (context_w.charCodeAt(0) < 256) {
                        for (i = 0; i < context_numBits; i++) {
                            context_data_val = (context_data_val << 1);
                            if (context_data_position == 15) {
                                context_data_position = 0;
                                context_data_string += f(context_data_val);
                                context_data_val = 0;
                            } else {
                                context_data_position++;
                            }
                        }
                        value = context_w.charCodeAt(0);
                        for (i = 0; i < 8; i++) {
                            context_data_val = (context_data_val << 1) | (value & 1);
                            if (context_data_position == 15) {
                                context_data_position = 0;
                                context_data_string += f(context_data_val);
                                context_data_val = 0;
                            } else {
                                context_data_position++;
                            }
                            value = value >> 1;
                        }
                    } else {
                        value = 1;
                        for (i = 0; i < context_numBits; i++) {
                            context_data_val = (context_data_val << 1) | value;
                            if (context_data_position == 15) {
                                context_data_position = 0;
                                context_data_string += f(context_data_val);
                                context_data_val = 0;
                            } else {
                                context_data_position++;
                            }
                            value = 0;
                        }
                        value = context_w.charCodeAt(0);
                        for (i = 0; i < 16; i++) {
                            context_data_val = (context_data_val << 1) | (value & 1);
                            if (context_data_position == 15) {
                                context_data_position = 0;
                                context_data_string += f(context_data_val);
                                context_data_val = 0;
                            } else {
                                context_data_position++;
                            }
                            value = value >> 1;
                        }
                    }
                    context_enlargeIn--;
                    if (context_enlargeIn == 0) {
                        context_enlargeIn = Math.pow(2, context_numBits);
                        context_numBits++;
                    }
                    delete context_dictionaryToCreate[context_w];
                } else {
                    value = context_dictionary[context_w];
                    for (i = 0; i < context_numBits; i++) {
                        context_data_val = (context_data_val << 1) | (value & 1);
                        if (context_data_position == 15) {
                            context_data_position = 0;
                            context_data_string += f(context_data_val);
                            context_data_val = 0;
                        } else {
                            context_data_position++;
                        }
                        value = value >> 1;
                    }


                }
                context_enlargeIn--;
                if (context_enlargeIn == 0) {
                    context_enlargeIn = Math.pow(2, context_numBits);
                    context_numBits++;
                }
            }

            // Mark the end of the stream
            value = 2;
            for (i = 0; i < context_numBits; i++) {
                context_data_val = (context_data_val << 1) | (value & 1);
                if (context_data_position == 15) {
                    context_data_position = 0;
                    context_data_string += f(context_data_val);
                    context_data_val = 0;
                } else {
                    context_data_position++;
                }
                value = value >> 1;
            }

            // Flush the last char
            while (true) {
                context_data_val = (context_data_val << 1);
                if (context_data_position == 15) {
                    context_data_string += f(context_data_val);
                    break;
                }
                else context_data_position++;
            }
            return context_data_string;
        }

    };

    LZS._keyStr = LZS.getKeyStr();

    var wzrk_util = {
        //expecting  yyyymmdd format either as a number or a string
        setDate: function (dt) {
            if (wzrk_util.isDateValid(dt)) {
                return "$D_" + dt;
            }
            wc.e(wzrk_msg['date-format-error']);
        },

        isDateObject: function (input) {
            return typeof(input) === "object" && (input instanceof Date);
        },

        convertToWZRKDate: function (dateObj) {
            return ("$D_" + Math.round(dateObj.getTime() / 1000) );
        },

        isDateValid: function (date) {
            var matches = /^(\d{4})(\d{2})(\d{2})$/.exec(date);
            if (matches == null) return false;
            var d = matches[3];
            var m = matches[2] - 1;
            var y = matches[1];
            var composedDate = new Date(y, m, d);
            return composedDate.getDate() == d &&
                composedDate.getMonth() == m &&
                composedDate.getFullYear() == y;
        },

        isArray: function (input) {
            return typeof(input) === "object" && (input instanceof Array);
        },

        isObject: function (input) {
            return Object.prototype.toString.call(input) == "[object Object]";
        },

        isObjectEmpty: function (obj) {
            for (var prop in obj) {
                if (obj.hasOwnProperty(prop))
                    return false;
            }
            return true;
        },

        isString: function (input) {
            return (typeof input == 'string' || input instanceof String);
        },


        // if yes, the convert using +number.
        isConvertibleToNumber: function (n) {
            return !isNaN(parseFloat(n)) && isFinite(n);
        },

        //from here - http://stackoverflow.com/a/1421988/2456615
        isNumber: function (n) {
            return /^-?[\d.]+(?:e-?\d+)?$/.test(n) && typeof n == 'number';
        },

        arrayContains: function (arr, obj) {
            function contains(arr, obj) {
                var i = arr.length;
                while (i--) {
                    if (arr[i] === obj) {
                        return true;
                    }
                }
                return false;
            }
        },

        getURLParams: function (url) {
            var urlParams = {};
            var idx = url.indexOf('?');

            if (idx > 1) {

                var uri = url.substring(idx + 1);


                var match,
                    pl = /\+/g,  // Regex for replacing addition symbol with a space
                    search = /([^&=]+)=?([^&]*)/g,
                    decode = function (s) {
                        return decodeURIComponent(s.replace(pl, " "));
                    },
                    query = uri;

                while (match = search.exec(query)) {
                    urlParams[decode(match[1])] = decode(match[2]);
                }

            }
            return urlParams;
        },

        getDomain: function (url) {
            if (url == "") return "";
            var a = document.createElement('a');
            a.href = url;
            return a.hostname;
        },


        //keys can't be greater than 32 chars, values can't be greater than 120 chars
        removeUnsupportedChars: function (o) {
            if (typeof o == "object") {
                for (var key in o) {
                    var sanitizedVal = wzrk_util.removeUnsupportedChars(o[key]);
                    var sanitizedKey = wzrk_util.isString(key) ? wzrk_util.sanitize(key, unsupportedKeyCharRegex) : key;

                    if (wzrk_util.isString(key)) {
                        sanitizedKey = wzrk_util.sanitize(key, unsupportedKeyCharRegex);
                        if (sanitizedKey.length > 32) {
                            sanitizedKey = sanitizedKey.substring(0, 32);
                            $WZRK_WR.reportError(520, sanitizedKey + "... length exceeded 32 chars. Trimmed.");
                        }
                    } else {
                        sanitizedKey = key;
                    }
                    delete o[key];
                    o[sanitizedKey] = sanitizedVal;
                }
            } else {
                var val;

                if (wzrk_util.isString(o)) {
                    val = wzrk_util.sanitize(o, unsupportedValueCharRegex);
                    if (val.length > 120) {
                        val = val.substring(0, 120);
                        $WZRK_WR.reportError(521, val + "... length exceeded 120 chars. Trimmed.");
                    }
                } else {
                    val = o;
                }
                return val;
            }
            return o;
        },

        sanitize: function (input, regex) {
            return input.replace(regex, '');
        },

        isLocalStorageSupported: function () {
            try {
                window.localStorage.setItem('wzrk_debug', '12345678');
                window.localStorage.removeItem('wzrk_debug');
                return 'localStorage' in window && window['localStorage'] !== null;
            } catch (e) {
                return false;
            }
        },

        isPersonalizationActive: function () {
            return (wzrk_util.isLocalStorageSupported() && wizrocket['enablePersonalization'])
        },

        getNow: function () {
            return Math.floor(((new Date()).getTime()) / 1000);
        },


        isSessionStorageSupported: function () {
            try {
                window.sessionStorage.setItem('wzrk_debug', '12345678');
                window.sessionStorage.removeItem('wzrk_debug');
                return 'sessionStorage' in window && window['sessionStorage'] !== null;
            } catch (e) {
                return false;
            }
        },
        getLengthInBytes: function (str) {
            // Force string type
            normal_val = String(str);

            var byteLen = 0;
            for (var i = 0; i < str.length; i++) {
                var c = str.charCodeAt(i);
                byteLen += c < (1 << 7) ? 1 :
                    c < (1 << 11) ? 2 :
                        c < (1 << 16) ? 3 :
                            c < (1 << 21) ? 4 :
                                c < (1 << 26) ? 5 :
                                    c < (1 << 31) ? 6 : Number.NaN;
            }
            return byteLen;
        },

        // detect Arabic, Persian, Urdu etc.
        isRightToLeftLanguage: function (str) {
            var pattern = /[\u0600-\u06FF\u0750-\u077F]/;
            result = pattern.test(text);
            return result;
        }


    };

// leading spaces, dot, colon, dollar, single quote, double quote, backslash, trailing spaces
    var unsupportedKeyCharRegex = new RegExp("^\\s+|\\\.|\:|\\\$|\'|\"|\\\\|\\s+$", "g");

// leading spaces, single quote, double quote, backslash, trailing spaces
    var unsupportedValueCharRegex = new RegExp("^\\s+|\'|\"|\\\\|\\s+$", "g");

//used to handle cookies in Opera mini
    var doubleQuoteRegex = new RegExp("\"", "g");
    var singleQuoteRegex = new RegExp("\'", "g");


    var wzrk_msg = {};
    var wzrk_error_txt = "CleverTap error: ";
    var data_not_sent_txt = "This property has been ignored.";
    wzrk_msg['embed-error'] = wzrk_error_txt + "Incorrect embed script.";
    wzrk_msg['event-error'] = wzrk_error_txt + "Event structure not valid. " + data_not_sent_txt;
    wzrk_msg['gender-error'] = wzrk_error_txt + "Gender value should be either M or F. " + data_not_sent_txt;
    wzrk_msg['employed-error'] = wzrk_error_txt + "Employed value should be either Y or N. " + data_not_sent_txt;
    wzrk_msg['married-error'] = wzrk_error_txt + "Married value should be either Y or N. " + data_not_sent_txt;
    wzrk_msg['education-error'] = wzrk_error_txt + "Education value should be either School, College or Graduate. " + data_not_sent_txt;
    wzrk_msg['age-error'] = wzrk_error_txt + "Age value should be a number. " + data_not_sent_txt;
    wzrk_msg['dob-error'] = wzrk_error_txt + "DOB value should be a Date Object";
    wzrk_msg['obj-arr-error'] = wzrk_error_txt + "Expecting Object array in profile";
    wzrk_msg['date-format-error'] = wzrk_error_txt + "setDate(number). number should be formatted as yyyymmdd";
    wzrk_msg['enum-format-error'] = wzrk_error_txt + "setEnum(value). value should be a string or a number";
    wzrk_msg['phone-format-error'] = wzrk_error_txt + "Phone number should be formatted as +[country code][number]";

} // function __wizrocket

$WZRK_WR = new __wizrocket();
$CLTP_WR = $WZRK_WR;
$WZRK_WR.init(); //this should always be the last in the JS file, as it needs all vars/functions to be defined to work.


/**
 * @preserve Copyright WizRocket, Inc. (ver.@timestamp@)
 *        ____ _                    _____
 *       / ___| | _____   _____ _ _|_   _|_ _ _ __
 *      | |   | |/ _ \ \ / / _ \ '__|| |/ _` | '_ \
 *      | |___| |  __/\ V /  __/ |   | | (_| | |_) |
 *       \____|_|\___| \_/ \___|_|   |_|\__,_| .__/
 *                                           |_|
 *
 */
