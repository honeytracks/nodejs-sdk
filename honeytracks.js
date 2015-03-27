var HoneyTracks = (function() {

    var request = require('request')
      , crypto  = require('crypto')
      , _initialize = require('./middleware/initialize.js')
      , http = require('http')
      , url = require('url')
      , util = require('util')
      , fs = require('fs')
      , querystring = require('querystring');

    var HONEYTRACKS_TRACKER_URL;
    var apiKey = null;
	var secretKey = null;
    var uniqueCustomerClickToken = false;
    var _newCustomer = false;
    var __HTTP_POST_QUEUE = [];
    var lastPOSTContent = null;
    var ignoredCustomers = [];
    var isSending = false;
    
    defaultData = {
        'ApiKey': null,
		'Language' : null,
		'ClientIP' : null,
		'Space' : null,
		'Version' : null,
		'UniqueCustomerIdentifier' : null,
		'MarketingIdentifier' : null,
		'Timestamp' : null
	};
	
	requiredValues = [
		'Action',
		'Language',
		'Space',
		'UniqueCustomerIdentifier'
	];
	
	configuration = {
		'TRACKING_URL' : 'http://tracker.honeytracks.com/?ApiKey=%s&s=%s',
		'SEND_IMMEDIATELY' : true,
		'PACKETS_STORAGE_PATH' : null,
		'NUMBER_OF_CALL_RETRIES': 1,
		'DEBUG': false
	};
    
    function HoneyTracksException() {
        var args = Array.prototype.slice.call(arguments);
        var NO_VALID_EXCEPTION_CODE = '%s is not a valid exception code';
        var exceptions = {
            '1': 'default data needs a valid value for key %s',
            '2': 'can\'t return a singleton instance of tracker library class, no default data was given and no instance exists',
            '3': 'tracking data have to be an array',
            '4': 'setOptions parameter have to be an array',
            '5': 'missing value for %s, %s',
            '6': '%s is not a valid configuration option',
            '7': 'UniqueCustomerClickToken is required data field when usesCookies is not set in initialize',
            '8': "can\'t open the url %s - %s"
        };
        this.name = "HoneyTracksException";
        var code = args[0].toString();
        if(exceptions[code]) this.message = exceptions[code];
        else {
            this.message = util.format(NO_VALID_EXCEPTION_CODE, code);
            return;
        }
        if(args.length > 1) {
            if( Object.prototype.toString.call( args[1] ) !== '[object Array]') {
                this.message = util.format.apply(null, [this.message].concat(args.slice(1)));
            } else if (args[1].length > 0) {
                this.message = util.format.apply(null, [this.message].concat(args[1]));
            }
        }
    }

    HoneyTracksException.prototype = Error.prototype;

    /**
    * calls the factory method without returning the library
    * 
    * @param array defaultData
    */
    function setup(_defaultData, configurationData) {
        if(isObject(_defaultData)) {
            if(_defaultData['ApiKey'] == undefined) throw new HoneyTracksException(1, 'ApiKey');
            if(_defaultData['SecretKey'] == undefined) throw new HoneyTracksException(1, 'SecretKey');
            apiKey = _defaultData['ApiKey'];
            secretKey = _defaultData['SecretKey'];

			delete _defaultData['SecretKey'];
			for(var key in defaultData){
			    if(_defaultData[key] !== undefined) defaultData[key] = _defaultData[key];
			}
		}
		if(configurationData) setConfigurationByArray(configurationData);
    }

    /**
    * sets a default data value
    *
    * @param string key
    * @param misc value
    */
    function setOption(key, value) {
        var optionPair = {};
        optionPair[key] = value;
        setOptions(optionPair);
    }

    /**
    * sets default data values by array
    *
    * @param Options
    * @throws HoneyTracksException
    */
    function setOptions(options) {
        if(!isObject(options)) throw new HoneyTracksException(4);
        for(var varName in options){
            var varValue = options[varName];
            if(varName.slice(0,2) !== '__' && defaultData[varName] !== undefined){
                defaultData[varName] = varValue;
            }
        }
    }
    
    /**
	 * add a block for all further events for the specified Space and UniqueCustomerIdentifier
	 * Events will be not added to the execution queue anymore
	 *
	 * @param space if null the currently configured value will be used
	 * @param uniqueCustomerIdentifier if null the currently configured value will be used
	 * @return bool
	 */
	function addCustomerEventBlock(space, uniqueCustomerIdentifier) {
	    if(!space) space = defaultData['Space'];
		if(!uniqueCustomerIdentifier) uniqueCustomerIdentifier = defaultData['UniqueCustomerIdentifier'];

        var shasum = crypto.createHash('sha1');
		shasum.update(space + '::' + uniqueCustomerIdentifier);

		ignoredCustomers[shasum.digest('hex')] = true;
		return true;
    }
    
    /**
	 * remove block for events for the specified Space and UniqueCustomerIdentifier
	 *
	 * @param space if null the currently configured value will be used
	 * @param uniqueCustomerIdentifier if null the currently configured value will be used
	 * @return bool
	 */
	function deleteCustomerEventBlock(space, uniqueCustomerIdentifier) {
	    if(!space) space = defaultData['Space'];
		if(!uniqueCustomerIdentifier) uniqueCustomerIdentifier = defaultData['UniqueCustomerIdentifier'];

        var shasum = crypto.createHash('sha1');
		shasum.update(space + '::' + uniqueCustomerIdentifier);

		var key = shasum.digest('hex');
		if(ignoredCustomers[key]) {
			delete ignoredCustomers[key];
			return true;
		}
		return false;
    }
    
    /**
	 * start executing the http queue manually
	 * 
	 * @return bool
	 */
	function commit(cb) {
		return executeHTTPQueue(cb);
	}
    
    /**
	 * define a path for storing packets if the transport to the tracking servers failed
	 * the expected path have to be a writable directory 
	 * 
	 * @param string path
	 */
	function setFailedTransportStoragePath(path) {
	    setConfiguration('PACKETS_STORAGE_PATH', path);
    }
    
    /**
	 * sets a configuration value
	 * following configuration values are available:
	 *
	 * TRACKING_URL: http://tracker.honeytracks.com/?ApiKey=%1s&s=%2s,
	 * NUMBER_OF_CALL_RETRIES: 3
	 * USE_CURL: false
	 * SEND_IMMEDIATELY: true
	 * PACKETS_STORAGE_PATH: null
	 *
	 * @param name
	 * @param value
	 * @return bool
	 */
	function setConfiguration(name, value) {
	    if(configuration[name] != undefined) {
			configuration[name] = value;
			return true;
		}
		return false;
    }
    
    function setConfigurationByArray(configurationData) {
        for(var k in configurationData){
            var v = configurationData[k];
            if(!setConfiguration(k, v)) throw new HoneyTracksException(6, k);
        }
	}
    
    /**
	 * create a tracking packet which have to send to the tracking server
	 * 
	 * @param string Action
	 * @param array data
	 */
	function track(action, data, cb) {
		if(!isObject(data))
			throw new HoneyTracksException(3);
		addHTTPTrackingCall(mergeObjects(
			defaultData,
			{'Action': action},
			data
		), cb);
	}
	
	/**
	 * tracks a user login
	 * 
	 * @param array data for overwriting DefaultData values
	 */
	function trackLogin(data, cb) {
	    if(arguments.length === 1){
	        cb = arguments[0];
	        data = {};
        }
		track('User::Login', data, cb);
	}
	
	/**
	 * tracks a user logout
	 * 
	 * @param array data for overwriting DefaultData values
	 */
	function trackLogout(data, cb) {
	    if(arguments.length === 1){
	        cb = arguments[0];
	        data = {};
        }
		track('User::Logout', data, cb);
	}
	
	/**
	 * tracks a user signup
	 * 
	 * @param string marketingIdentifier defines the campaign from which the user came from, if array given the elements MarketingIdentifier and Keyword are expected
	 * @param array data for overwriting DefaultData values
	 */
	function trackSignup(marketingIdentifier, landingPage, data, cb) {
	    if(arguments.length === 1){
	        cb = arguments[0];
	        marketingIdentifier = '';
	        landingPage = '';
	        data = {};
	    } else if(arguments.length === 2){
	        cb = arguments[1];
	        landingPage = '';
	        data = {};
	    } else if(arguments.length === 3){
	        cb = arguments[2];
	        data = {};
	    }
	    
		var keyword = '';
		var adInformations = {};
		if(isObject(marketingIdentifier)) {
			var keyword;
			if(marketingIdentifier['Keyword']) keyword = marketingIdentifier['Keyword'];
            if(marketingIdentifier['PartnerName']) adInformations['PartnerName'] = marketingIdentifier['PartnerName'];
            if(marketingIdentifier['CampaignName']) adInformations['CampaignName'] = marketingIdentifier['CampaignName'];
            if(marketingIdentifier['AdName']) adInformations['AdName'] = marketingIdentifier['AdName'];

			marketingIdentifier = marketingIdentifier['MarketingIdentifier'];
		}
		
		var cuct = uniqueCustomerClickToken;
		if(!data['UniqueCustomerClickToken'] && cuct !== false) data['UniqueCustomerClickToken'] = cuct;
	    if(!data['MarketingIdentifier']) data['MarketingIdentifier'] = marketingIdentifier;
	    if(!data['Keyword']) data['Keyword'] = keyword;
	    if(!data['LandingPage']) data['LandingPage'] = landingPage;
	    if(!data['IsFreeAction']) data['IsFreeAction'] = 'true';
		for(var k in adInformations) if(!data[k]) data[k] = adInformations[k];
		
		track('User::Signup', data, cb);
	}
	
	/**
	 * tracks a user click and sets a cookie to the user to track only unique clicks
	 * 
	 * @param string marketingIdentifier if array the elements MarketingIdentifier and Keyword are expected
	 * @param bool TrackOnlyUnique specify if the click should only tracked if the marketingIdentifier changes
	 * @param int ExpireDays number of days within the click tracking cookie will be available, used for make the TrackOnlyUnique-functionality available
	 * @param array data
	 */
	function trackClick(marketingIdentifier, landingPage, trackOnlyUnique, data, cb) {
	    if(arguments.length === 1){
	        cb = arguments[1];
	        marketingIdentifier = '';
	        trackOnlyUnique = true;
	        landingPage = 'default';
	        data = {}
	    } else if(arguments.length === 2){
	        cb = arguments[1];
	        trackOnlyUnique = true;
	        landingPage = 'default';
	        data = {}
	    } else if(arguments.length === 3){
	        cb = arguments[2];
	        trackOnlyUnique = true;
	        data = {}
	    } else if(arguments.length === 4){
	        cb = arguments[3];
	        data = {}
	    }
	    	    
		var keyword = '';
		var adInformations = {};
		
		if(typeof(marketingIdentifier) === 'object') {
			var keyword;
			if(marketingIdentifier['Keyword']) keyword = karketingIdentifier['Keyword'];
            if(marketingIdentifier['PartnerName']) adInformations['PartnerName'] = marketingIdentifier['PartnerName'];
            if(marketingIdentifier['CampaignName']) adInformations['CampaignName'] = marketingIdentifier['CampaignName'];
            if(marketingIdentifier['AdName']) adInformations['AdName'] = marketingIdentifier['AdName'];

			marketingIdentifier = marketingIdentifier['MarketingIdentifier'];
		}

		var customerToken = uniqueCustomerClickToken;
		if(data['UniqueCustomerClickToken']) {
			customerToken = UniqueCustomerClickToken
		} else if (!data['UniqueCustomerClickToken'] && !customerToken){
		    throw new HoneyTracksException(7)
		}
		
		if(_newCustomer === true || trackOnlyUnique === false) {
    	    if(!data['MarketingIdentifier']) data['MarketingIdentifier'] = marketingIdentifier;
    	    if(!data['Keyword']) data['Keyword'] = keyword;
    	    if(!data['LandingPage']) data['LandingPage'] = landingPage;
    	    if(!data['UniqueCustomerClickToken']) data['UniqueCustomerClickToken'] = customerToken;
    		for(var k in adInformations) if(!data[k]) data[k] = adInformations[k];
		
			track('User::Click', data, cb);
		} else {
		    cb(false);
		}
	}
	
	/**
	 * tracks the purchase of virtual currency for the amount of virtual currency, revenue and payout 
	 * 
	 * @param float|array virtualCurrencyAmount (array must have Amount and Name as k/v-pair, e.g. {'Name': 'Gold', 'Amount': 100)
	 * @param string paymentType
	 * @param float revenue
	 * @param string revenueCurrency
	 * @param float payout
	 * @param string payoutCurrency
	 * @param bool isFreeAction
	 * @param array data for overwriting DefaultData values
	 */
	function trackVirtualCurrencyPurchase(virtualCurrencyAmount, paymentType, revenue, revenueCurrency, payout, payoutCurrency, isFreeAction, data, cb) {
	    if(arguments.length === 6){
	        cb = arguments[5];
	        payoutCurrency = null;
    	    isFreeAction = false;
            data = {};
        } else if(arguments.length === 7){
            cb = arguments[6];
            isFreeAction = false;
            data = {};
        } else if(arguments.length === 8){
            cb = arguments[7];
            data = {};
        }
        if(isObject(virtualCurrencyAmount) && !data['VirtualCurrencyName'] && virtualCurrencyAmount['Name']) {
            data['VirtualCurrencyName'] = virtualCurrencyAmount['Name'];
            virtualCurrencyAmount = virtualCurrencyAmount['Amount'];
        } else if(isObject(virtualCurrencyAmount))
            virtualCurrencyAmount = virtualCurrencyAmount['Amount'];

		track('VirtualCurrencies::Buy', mergeObjects({
			'VirtualCurrencyAmount': parseFloat(virtualCurrencyAmount),
			'Revenue': parseFloat(revenue),
			'RevenueCurrency': revenueCurrency,
			'Payout': parseFloat(payout),
			'PayoutCurrency': payoutCurrency !== null?payoutCurrency:revenueCurrency,
			'PaymentType': paymentType,
			'IsFreeAction': isFreeAction?'true':'false'
		}, data), cb);
	}
	
	/**
	 * tracks the chargebacks for virtual currency purchases, e.g. a creditcard chargeback 
	 * 
	 * @param float|array virtualCurrencyAmount (array must have Amount and Name as k/v-pair, e.g. {'Name': 'Gold', 'Amount': 100)
	 * @param string paymentType
	 * @param float revenue
	 * @param string revenueCurrency
	 * @param float payout
	 * @param string payoutCurrency
	 * @param array data for overwriting DefaultData values
	 */
	function trackVirtualCurrencyChargeback(virtualCurrencyAmount, paymentType, revenue, revenueCurrency, payout, payoutCurrency, data, cb) {
	    if(arguments.length === 6){
	        cb = arguments[5];
	        payoutCurrency = null;
    	    data = {};
        } else if(arguments.length === 7){
    	    cb = arguments[6];
    	    data = {};
        }
        	    
        if(isObject(virtualCurrencyAmount) && !data['VirtualCurrencyName'] && virtualCurrencyAmount['Name']) {
            data['VirtualCurrencyName'] = virtualCurrencyAmount['Name'];
            virtualCurrencyAmount = virtualCurrencyAmount['Amount'];
        } else if(isObject(virtualCurrencyAmount))
            virtualCurrencyAmount = virtualCurrencyAmount['Amount'];

        track('VirtualCurrencies::Chargeback', mergeObjects({
			'Quantity': parseFloat(virtualCurrencyAmount),
			'Value': parseFloat(revenue),
			'Currency': revenueCurrency,
			'Payout': parseFloat(payout),
			'PayoutCurrency': payoutCurrency !== null?payoutCurrency:revenueCurrency,
			'PaymentType': paymentType
		}, data), cb);
	}
	
	/**
	 * tracks the purchase of virtual good features for feature type, a possible feature sub type and the virtual currency amount
	 * 
	 * @param string featureType, e.g. Premium
	 * @param string featureSubType e.g. Package1, can be null if no sub type available
	 * @param float|array virtualCurrencyAmount the virtual currency amount spent for the feature (array must have Amount and Name as k/v-pair, e.g. {'Name': 'Gold', 'Amount': 100)
	 * @param misc gameCurrency the game currency spent, can be an array if there are more than one game currency (e.g. resources in a strategy game)
	 * @param int quantity the quantity
	 * @param bool isFreeAction if the transaction is a decoy offer
	 * @param array data for overwriting DefaultData values
	 */
	function trackVirtualGoodsFeaturePurchase(featureType, featureSubType, virtualCurrencyAmount, gameCurrency, quantity, isFreeAction, data, cb) {
        if(arguments.length === 4){
            cb = arguments[3];
            gameCurrency = null;
    	    quantity = 1;
    	    isFreeAction = false;
            data = {};
        } else if(arguments.length === 5){
    	    cb = arguments[4];
    	    quantity = 1;
    	    isFreeAction = false;
            data = {};
        } else if(arguments.length === 6){
    	    cb = arguments[5];
    	    isFreeAction = false;
            data = {};
        } else if(arguments.length === 7){
            cb = arguments[6];
            data = {};
        }
        
        
        if(isObject(virtualCurrencyAmount) && !isset(data['VirtualCurrencyName']) && isset(virtualCurrencyAmount['Name'])) {
            data['VirtualCurrencyName'] = virtualCurrencyAmount['Name'];
            virtualCurrencyAmount = virtualCurrencyAmount['Amount'];
        } else if(isObject(virtualCurrencyAmount))
            virtualCurrencyAmount = virtualCurrencyAmount['Amount'];

        track('VirtualGoods::' + featureType + (!is_null(featureSubType)?('::'+featureSubType):''), mergeObjects({
			'Value': virtualCurrencyAmount,
			'Quantity': quantity,
			'GameCurrency': JSON.stringify(gameCurrency),
			'FeatureType': featureType,
			'FeatureSubType': featureSubType,
			'IsFreeAction': isFreeAction?'true':'false'
		}, data), cb);
	}
	
	/**
	 * tracks the purchase of an item, e.g. for a sword, a pant but not limited to this kind of items 
	 * 
	 * @param string itemType
	 * @param array item the item can be specified further:
	 * 						- misc UniqueId contains the id of the item, e.g. Item1: sword of fear, Item2: pant of..., Item3. etc.
	 * 						- string ImageUrl contains the url to the item image 
	 * 						- string Name contains the name or a localisation text key for the item
	 * @param float|array virtualCurrencyAmount (array must have Amount and Name as k/v-pair, e.g. {'Name': 'Gold', 'Amount': 100)
	 * @param misc gameCurrency the game currency spent, can be an array if there are more than one game currency (e.g. resources in a strategy game)
	 * @param int quantity
	 * @param bool isFreeAction
	 * @param array data for overwriting DefaultData values
	 */
	function trackVirtualGoodsItemPurchase(itemType, item, virtualCurrencyAmount, gameCurrency, quantity, isFreeAction, data, cb) {
	    if(arguments.length === 4){
            cb = arguments[3];
            gameCurrency = null;
    	    quantity = 1;
    	    isFreeAction = false;
            data = {};
        } else if(arguments.length === 5){
    	    cb = arguments[4];
    	    quantity = 1;
    	    isFreeAction = false;
            data = {};
        } else if(arguments.length === 6){
    	    cb = arguments[5];
    	    isFreeAction = false;
            data = {};
        } else if(arguments.length === 7){
            cb = arguments[6];
            data = {};
        }

        if(isObject(virtualCurrencyAmount) && !data['VirtualCurrencyName'] && virtualCurrencyAmount['Name']) {
            data['VirtualCurrencyName'] = virtualCurrencyAmount['Name'];
            virtualCurrencyAmount = virtualCurrencyAmount['Amount'];
        } else if(isObject(virtualCurrencyAmount))
            virtualCurrencyAmount = virtualCurrencyAmount['Amount'];

        track('VirtualGoods::Item::Buy::' + itemType, mergeObjects({
			'Value': virtualCurrencyAmount,
			'Quantity': quantity,
			'GameCurrency': JSON.stringify(gameCurrency),
			'IsFreeAction': isFreeAction?'true':'false',
			'ItemType': itemType,
			'Item': JSON.stringify(item)
		}, data), cb);
	}
	
	/**
	 * tracks the level up of an user
	 * if your game has no user levels please try to find a similar value for this, levels should represents the progress of an user and is
	 * very important for analytics purposes of different time based game states
	 * a possible solution for a soccer game could be the league of the user, for strategic build & raid games could be the number of bases or tech tree activations
	 * at least, if there is no such level available for your game, we'll auto create levels by using an exponential diff between signup time and last login  
	 * 
	 * @param int level starts with 1 and is infite
	 * @param array data for overwriting DefaultData values
	 */
	function trackLevelup(level, data, cb) {
	    if(arguments.length === 2){
	        cb = arguments[1];
            data = {};
        }
		track('User::Levelup', mergeObjects({
			'Value': level
		}, data), cb);
	}
	
	/**
	 * tracks the usage of a single game feature, e.g. make a game, fight a battle, start a construction, skill your character, etc. 
	 * 
	 * @param string featureType e.g. Training
	 * @param string featureSubType e.g. Strength
	 * @param misc gameCurrency the game currency spent, can be an array if there are more than one game currency (e.g. resources in a strategy game)
	 * @param int quantity
	 * @param string featureThirdType whatever you want, the tree order is featureType->featureSubType->featureThirdType
	 * @param array data for overwriting DefaultData values
	 */     
	function trackFeatureUsage(featureType, featureSubType, featureSubSubType, gameCurrency, quantity, data, cb) {
	    if(arguments.length === 3){
            cb = arguments[2];
            featureSubSubType = null;
    	    gameCurrency = null;
    	    quantity = 1;
    	    data = {};
        } else if(arguments.length === 4){
    	    cb = arguments[3];
    	    gameCurrency = null;
    	    quantity = 1;
    	    data = {};
        } else if(arguments.length === 5){
    	    cb = arguments[4];
    	    quantity = 1;
    	    data = {};
        } else if(arguments.length === 6){
            cb = arguments[5];
    	    data = {};
        }
	    
		track('Feature::Usage::' + featureType + '::' + featureSubType, mergeObjects({
			'FeatureType': featureType,
			'FeatureSubType': featureSubType,
			'FeatureThirdType': featureSubSubType,
			'GameCurrency': JSON.stringify(gameCurrency),
			'Quantity': quantity
		}, data), cb);
	}
	
	/**
	 * tracks the invitation of a friend / friends, e.g. useful for facebook wall message posts 
	 * 
	 * @param string inviteType defines the type of invitation in your game, e.g. Neighbor Invitation
	 * @param string inviteMessageToken defines the message id which was sent
	 * @param int quantity defines the number of invitations send at once
	 * @param array data for overwriting DefaultData values
	 */
	function trackViralityInvitation(inviteType, inviteMessageToken, quantity, data, cb) {
	    if(arguments.length === 3){
            quantity = 1;
            cb = arguments[2];
    	    data = {};
        } else if(arguments.length === 4){
            cb = arguments[3];
    	    data = {};
        }
        
		track('Virality::Invitation::' + inviteType, mergeObjects({
			'InviteType': inviteType,
			'InviteMessageToken': inviteMessageToken,
			'Quantity': quantity
		}, data), cb);
	}
	
	/**
	 * tracks the invitation acceptance of a new user
	 * you to have add the invite type, message token and the inviting unique customer token to the invitation message and use these values in this tracking call
	 * 
	 * @param string inviteType defines the type of invitation in your game, e.g. Neighbor Invitation
	 * @param string inviteMessageToken defines the message id which was sent
	 * @param string sourceUniqueCustomerIdentifier defines the unique customer token which sent the invitation
	 * @param array data for overwriting DefaultData values
	 */
	function trackViralityInviteAcceptance(inviteType, inviteMessageToken, sourceUniqueCustomerIdentifier, data, cb) {
	    if(arguments.length === 4){
    	    cb = arguments[3];
    	    data = {};
        }
		track('Virality::Invitation::Acceptance::' + inviteType, mergeObjects({
			'InviteType': inviteType,
			'InviteMessageToken': inviteMessageToken,
			'SourceUniqueCustomerIdentifier': sourceUniqueCustomerIdentifier,
		}, data), cb);
	}
	
	/**
	 * tracks the gender of a user 
	 * 
	 * @param string gender should only contain male or female
	 * @param array data for overwriting DefaultData values
	 */
	function trackUserGender(gender, data, cb) {
	    if(arguments.length === 2){
	        cb = arguments[1];
    	    data = {};
        }
		track('User::Profile', mergeObjects({
			'Type': 'Gender',
			'Value': gender
		}, data), cb);
	}
	
	/**
	 * tracks the birthyear of a user 
	 * 
	 * @param int birthyear e.g. 1975, 1980, 1991
	 * @param array data for overwriting DefaultData values
	 */
	function trackUserBirthyear(birthyear, data, cb) {
	    if(arguments.length === 2){
	        cb = arguments[1];
    	    data = {};
        }
		track('User::Profile', mergeObjects({
			'Type': 'Birthyear',
			'Value': birthyear
		}, data), cb);
	}

	/**
	 * tracks a custom classification of the user
	 *
	 * @param string customStaticClassification e.g. 'group B', 'users 001'...
	 * @param array data for overwriting DefaultData values
	 */
	function trackUserCustomStaticClassification(customStaticClassification, data, cb) {
	    if(arguments.length === 2){
	        cb = arguments[1];
    	    data = {};
        }
		track('User::Profile', mergeObjects({
				'Type': 'CustomStaticClassification',
				'Value': customStaticClassification
		}, data), cb);
	}

	
	/**
	 * sets a customer click token saved in cookies
	 * 
	 */
	function setUniqueCustomerClickToken(_uniqueCustomerClickToken, newCustomer){
	    _newCustomer = newCustomer;
	    uniqueCustomerClickToken = _uniqueCustomerClickToken;
	}
	
	function mergeObjects(){
	    var resp = {};
	    for(var argIdx in arguments){
	        var obj = arguments[argIdx];
	        for(var k in obj) resp[k] = obj[k];
	    }
	    return resp;
	}
    
    function isObject(val) {
        return (val !== null && typeof(val) === 'object');
    }
    
    /**
	 * returns the tracking url
	 */
	function getTrackingUrl() {
		return util.format(HONEYTRACKS_TRACKER_URL || configuration['TRACKING_URL'], apiKey);
	}

	/**
	 * determine the client ip from several headers
	 *
	 * regarding privacy concerns the last octet will not transfered to tracking servers
	 * this method accepts IPv4 and IPv6 addresses, but country detection based on ip will work only for IPv4 addresses correctly
	 */
	function setClientIP(req) {
		if(defaultData['ClientIP'] == null) {
		    var ipRE = /^(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/i;
		    if (req.headers['X-Forwarded-For'] && ipRE.test(req.headers['X-Forwarded-For'])) {
		        defaultData['ClientIP'] = req.headers['X-Forwarded-For'];
		    } else if(req.connection.remoteAddress && ipRE.test(req.connection.remoteAddress)){
    		    defaultData['ClientIP'] = req.connection.remoteAddress;
		    }
		}

		if(defaultData['ClientIP'] !== null) {
			// remove the last octet regarding privacy concerns
			if(defaultData['ClientIP'].indexOf(':') === -1) // IPv4
			    defaultData['ClientIP'] = defaultData['ClientIP'].replace(/\.([0-9]{1,3}$)/ + '.xxx');
			else // IPv6
			    defaultData['ClientIP'] = defaultData['ClientIP'].replace(/:([0-9a-f]{1,4}$)/ + ':xxxx');
		}
	}

	/**
	 * adds a packet to the queue
	 *
	 * @param array data
	 * @return bool
	 */
	function addHTTPTrackingCall(data, cb) {
	    for(var idx in requiredValues) {
	        var key = requiredValues[idx];
	        if( (!data[key] || data[key].length == 0) && !(key == 'UniqueCustomerIdentifier' && data['Action'] && (data['Action'] == 'User::Click' || data['Action'].indexOf('Feature::Usage') !== -1) && data['UniqueCustomerClickToken'])){
				throw new HoneyTracksException(5, key, JSON.stringify(data));
			}
	    }
	    if(configuration['DEBUG']) console.log("HTDEBUG: addHTTPTrackingCall:" + JSON.stringify(data));
		/**
		 * avoid adding events to the http queue if the event user is blocked for events
		 */
		var shasum = crypto.createHash('sha1');
		shasum.update(data['Space'] + '::' + data['UniqueCustomerIdentifier']);
				
		if(ignoredCustomers.length > 0 && ignoredCustomers[shasum.digest('hex')]){
		    cb(false);
		    return;
		}
		
		__HTTP_POST_QUEUE.push(data);

		if(__HTTP_POST_QUEUE.length >= 9) {
			executeHTTPQueue(function(success){
			    cb(success);
			});
        } else {
            cb(true);
        }
	}
	
	/**
	 * runs through the packets queue and send the packets to the tracking server within one http call
	 */
	function executeHTTPQueue(cb) {
	    if(configuration['DEBUG']) console.log("HTDEBUG: __HTTP_POST_QUEUE.length: " + __HTTP_POST_QUEUE.length);
	    
		if(__HTTP_POST_QUEUE.length > 0 && !isSending) {
			var callTry = 0;
			isSending = true;
			function makeCall(cb){
			    try {
					callTry++;
					httpTrackingCall({'Packets' : __HTTP_POST_QUEUE}, function(response){
					    if(response.indexOf('ok') !== -1) {
    						cb(true)
    						return;
    					} else if(callTry < configuration['NUMBER_OF_CALL_RETRIES']) {
    						makeCall(cb);
    					} else {
    					    cb(false);
    					    return;
    					}
					});
				} catch(e) {
				    console.log('ERR: ' + e.message)
					if(callTry < configuration['NUMBER_OF_CALL_RETRIES']){
					    makeCall(cb);
					} else {
					    cb(false);
					    return;
					}
				}
			}
			makeCall(function(transportOk){
			    isSending = false;
			    if(transportOk === false) {
    				savePackets(lastPOSTContent, function(){
    				    __HTTP_POST_QUEUE = [];
            			cb(transportOk);
            			return;
    				});
				}
				__HTTP_POST_QUEUE = [];
				cb(transportOk);
				return;
			});
		} else {
		    cb(false);
		}		
	}
	
	function isWritable(path) {
        var stat = fs.lstatSync(configuration['PACKETS_STORAGE_PATH'])
        owner, inGroup, mode
        var owner = process.uid === stat.uid;
        var inGroup = process.gid === stat.gid;
        var mode = stat.mode;
        return owner && (mode & 00200) || inGroup && (mode & 00020) || (mode & 00002);
    }
    
	/**
	 * store packets which were not sent on filesystem
	 * this only happens if PACKETS_STORAGE_PATH configuration value was set a package sending
	 * failed or the SEND_IMMEDIATELY configuration value was set to (bool)false
	 *
	 * @string data
	 * @return misc
	 */
	function savePackets(data, cb) {
	    if(!data) data = lastPOSTContent;
	    
		if(
			configuration['PACKETS_STORAGE_PATH'] != undefined &&
			typeOf(configuration['PACKETS_STORAGE_PATH']) === 'string' &&
			fs.existsSync(configuration['PACKETS_STORAGE_PATH']) &&
			fs.lstatSync(configuration['PACKETS_STORAGE_PATH']).isDirectory() &&
			isWritable(configuration['PACKETS_STORAGE_PATH'])
		) {
		    var today = new Date();
		    var date = today.getFullYear() + '-' + today.getMonth() + '-' + today.getDate();
		    var hour = today.getHours();
			var minute = today.getMinutes();
			var second = today.getSeconds();
			var path = 'tracking_data_' + date + '_' + hour + '-' + minute + '-' + second + '-' + process.uid;
			path = configuration['PACKETS_STORAGE_PATH'] + (configuration['PACKETS_STORAGE_PATH'].slice(-1) !== '/'?'/':'') + path;

            fs.writeFile(path, today.getTime() + ': ' + data + '\n', function(err) {
                if(err) {
                    cb(false);
                } else {
                    cb(true);
                }
            });
		} else {
		    cb(false);
		}
	}

	function httpTrackingCall(data, cb) {
		httpPost(
			util.format(
				HONEYTRACKS_TRACKER_URL || configuration['TRACKING_URL'],
				apiKey,
				createTrackingCallToken(data['Packets'])
			),
			data,
			function(resp){
			    cb(resp);
			}
		);
	}
	
	/**
	 * executes the http call to tracking server
	 * 
	 * @param string url
	 * @param array data
	 * @throws HoneyTracks_Tracker_Library_Transport_Exception
	 */
	function httpPost(tracksURL, data, cb) {
		postContent = [];
		
		// no recursion, the expected format is static
		for(var varName in data) {
		    var varValue = data[varName];
			if(isObject(varValue)) {
			    for(var subVarName in varValue) {
			        var subVarValue = varValue[subVarName];
					if(isObject(subVarValue)) {
					    for(var sub2VarName in subVarValue) {
					        var sub2VarValue = subVarValue[sub2VarName];
							if(isObject(sub2VarValue)) {
							    for(var sub3VarName in sub2VarValue) {
							        var sub3VarValue = sub2VarValue[sub3VarName];
									postContent.push(encodeURIComponent(varName) + '[' + encodeURIComponent(subVarName) + '][' + encodeURIComponent(sub2VarName) + '][' + encodeURIComponent(sub3VarName) + ']=' + encodeURIComponent(sub3VarValue));
								}
							} else
								postContent.push(encodeURIComponent(varName) + '[' + encodeURIComponent(subVarName) + '][' + encodeURIComponent(sub2VarName) + ']=' + encodeURIComponent(sub2VarValue));
						}
					} else
						postContent.push(encodeURIComponent(varName) + '[' + encodeURIComponent(subVarName) + ']=' + encodeURIComponent(subVarValue));
				}
			} else
				postContent.push(encodeURIComponent(varName) + '=' + encodeURIComponent(subVarValue));
		}

		lastPOSTContent = postContent.join('&');
		if(configuration['SEND_IMMEDIATELY'] !== true && configuration['PACKETS_STORAGE_PATH'] == null) {
			savePackets(lastPOSTContent, function(success){
			    cb(success?'ok':'failed');
			});
		} else {
		    var parsedURL = url.parse(tracksURL);
            var options = {
                host: parsedURL['hostname'],
                port: parsedURL['port'] || 80,
                path: parsedURL['pathname'] + "?" + parsedURL['query'],
                method: 'POST',
                headers: {'Content-Type': 'application/x-www-form-encodeURIComponentd', 'Content-Length': Buffer.byteLength(lastPOSTContent)}
            };

            var request = http.request(options, function(response) {
                var responseData = "";
                response.on('data', function (chunk) {
                    responseData += chunk.toString();
                });
                response.on('end', function () {
                    if(configuration['DEBUG']) console.log("HTDEBUG: server response: " + responseData);
                    cb(responseData);
                });
            });
            request.on('error', function(error) {
                if(configuration['DEBUG']) console.log("HTDEBUG: ht err:" + error.message);
                throw new HoneyTracksException(8, tracksURL, error.message);
            });

            request.write(lastPOSTContent);
            request.end();
		}
	}
	
	/**
	 * create a seal token for the given data
	 * 
	 * @param array data
	 * @return string
	 */
	function createTrackingCallToken(data) {
		var time = new Date().getTime();
		var chk = JSON.stringify(data);
		var shasum = crypto.createHash('sha1');
		shasum.update(apiKey + '::' + secretKey + '::' + chk + '::' + time);
		
		return 'sha1-htv2$' + time + '$' + shasum.digest('hex')
	}
	
	function initialize() {
	    return _initialize.apply(this, arguments);
	}
    
    return {
          setup: setup
        , initialize: initialize
        , setOption: setOption
        , setOptions: setOptions
        , addCustomerEventBlock: addCustomerEventBlock
        , deleteCustomerEventBlock: deleteCustomerEventBlock
        , commit: commit
        , setFailedTransportStoragePath: setFailedTransportStoragePath
        , track: track
        , trackLogin: trackLogin
        , trackLogout: trackLogout
        , trackSignup: trackSignup
        , trackClick: trackClick
        , setUniqueCustomerClickToken: setUniqueCustomerClickToken
        , trackVirtualCurrencyPurchase: trackVirtualCurrencyPurchase
        , trackVirtualCurrencyChargeback: trackVirtualCurrencyChargeback
        , trackVirtualGoodsFeaturePurchase: trackVirtualGoodsFeaturePurchase
        , trackVirtualGoodsItemPurchase: trackVirtualGoodsItemPurchase
        , trackLevelup: trackLevelup
        , trackFeatureUsage: trackFeatureUsage
        , trackViralityInvitation: trackViralityInvitation
        , trackViralityInviteAcceptance: trackViralityInviteAcceptance
        , trackUserGender: trackUserGender
        , trackUserBirthyear: trackUserBirthyear
        , trackUserCustomStaticClassification: trackUserCustomStaticClassification
        , setConfiguration: setConfiguration
        , setConfigurationByArray: setConfigurationByArray
        , setClientIP: setClientIP
    };

})();

module.exports = HoneyTracks;