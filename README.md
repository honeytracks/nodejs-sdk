# NodeJS Library for HoneyTracks

Using the tracking needs a valid account at https://panel.honeytracks.com and the corresponding product ApiKey and SecretKey

**Author:** [coolblade](http://www.github.com/coolblade)

**License:** Apache v2

# Installing HoneyTracks

```
npm install honeytracks
```

### require
```javascript
var HoneyTracks = require('honeytracks');
```

### Setup your honeytracks configuration
```javascript
HoneyTracks.setup({
    ApiKey: 'YOUR_API_KEY',
    Language: 'en_GB',
    Space: 'default',
    SecretKey: 'YOUR_SECRET_KEY'
};
```

For a full list of setup options please see the honeytracks docs at docs.honeytracks.com

### Initialize honeytracks into your app life cycle
```javascript
app.use(HoneyTracks.initialize(true));
```

Setting the first param to true enables cookie support to have module handle UniqueCustomerClickToken. In this case be sure to position the HoneyTracks initialize middleware after the CookieParser middleware. If you wish to handle the UniqueCustomerClickToken yourself you can set this to false and in TrackClick pass in your own UniqueCustomerClickToken in the optional data parameter. Also note that UniqueCustomerIdentifier is not necessary for the TrackClick event, this is useful for new users where the user account id is not yet known/created.

# API

#### trackClick
__https://docs.honeytracks.com/wiki/TrackClick/PHP__  
Tracks a user click and sets a cookie named as HTCTR to track only unique clicks. This method is used for tracking user clicks on ads and will be combined with marketing configured marketing costs.
```
req.honeyTracks.trackClick('ad1', 'page1', function(success){console.log('success': success)})
```

#### trackFeatureUsage
__https://docs.honeytracks.com/wiki/TrackFeatureUsage/PHP__  
Tracks the usage of a single game feature, e.g. make a game, fight a battle, start a construction, skill your character, etc.
```
req.honeyTracks.trackFeatureUsage('Fight', 'PvP', null, {'Gold': 15}, 1, function(success){console.log('success': success)});
```

#### trackLevelup
__https://docs.honeytracks.com/wiki/TrackLevelup/PHP__  
Tracks the level up of an user. If your game has no user levels you can use any other metric / value, which tracks the progression of a user. Being able to analyze in-game data by levels or the progression of users is very important for analytics purposes. Among other things this will allow you to optimize game-design for longer user retention. A possible solution for a soccer game could be the league of the user, for strategic build and raid games could be the number of bases/planets or tech tree activations.
```
req.honeyTracks.trackLevelup(6, function(success){console.log('success': success)});
```

#### trackLogin
__https://docs.honeytracks.com/wiki/TrackLogin/PHP__  
Tracks the user login.
```
req.honeyTracks.trackLogin(function(success){console.log('success': success)});
```

#### trackLogout
__https://docs.honeytracks.com/wiki/TrackLogout/PHP__  
Tracks the user logout
```
req.honeyTracks.trackLogout(function(success){console.log('success': success)});
```

#### trackSignup
__https://docs.honeytracks.com/wiki/TrackSignup/PHP__  
Tracks the user signup, if available with the corresponding marketing identifier token.
```
req.honeyTracks.trackSignup('ad1', 'page1', {'UniqueCustomerClickToken': '3askj32jn3laskjdj2ijdlakdaikwokjsm2342'}, function(success){console.log('success': success)})
```

#### trackUserBirthyear
__https://docs.honeytracks.com/wiki/TrackUserBirthyear/PHP__  
Tracks the user birthyear if known.
```
req.honeyTracks.trackUserBirthyear(1980, function(success){console.log('success': success)})
```

#### trackUserGender
__https://docs.honeytracks.com/wiki/TrackUserGender/PHP__  
Tracks the user gender if known.
```
req.honeyTracks.trackUserGender('female', function(success){console.log('success': success)});
```

#### trackUserCustomStaticClassification
__https://docs.honeytracks.com/wiki/TrackUserCustomStaticClassification/PHP__  
Tracks a custom classification of the user, e.g. useful for A/B-testing purposes. An user can have only one classification at the same time, keep in mind that the classification is only changed for today and the future and not for the past.
```
req.honeyTracks.trackUserCustomStaticClassification('feature set b', function(success){console.log('success': success)});
```

#### trackViralityInvitation
__https://docs.honeytracks.com/wiki/TrackViralityInvitation/PHP__  
Tracks an invitation sent by a user. To analyze the success of different invitation types and messages the invitation type and a unique message token are neccessary. Invitation types itself defines for example a neighborhood invitation or gifting. Your application has to ensure that the target link of an invitation contains the InviteType, InviteMessageToken and the unique customer identifier token to get valid analyses of success rates grouped by levels and marketing cohorts.
```
req.honeyTracks.trackViralityInvitation('Neighbourhood', 'NH_INVITATION_MSG_1', 1, function(success){console.log('success': success)});
```

#### trackViralityInviteAcceptance
__https://docs.honeytracks.com/wiki/TrackViralityInviteAcceptance/PHP__  
Tracks the acceptance of an invitation. Your application has to ensure that the InvitationType, the InviteMessageToken and the unique customer identifier token is available after a user accepts an invitation, e.g. you have to ensure that your links which the users clicks has all the necessary. This method should be called after a signup if the corresponding invitation information are available within the first request to your landing.
```
req.honeyTracks.trackViralityInviteAcceptance ('Neighbourhood', 'NH_INVITATION_MSG_1', 'User1', function(success){console.log('success': success)});
```

#### trackVirtualCurrencyPurchase
__https://docs.honeytracks.com/wiki/TrackVirtualCurrencyPurchase/PHP__  
Tracks a purchase of virtual currency.
```
req.honeyTracks.trackVirtualCurrencyPurchase(55.0, 'CreditCard', 1.99, 'EUR', 1.438, 'EUR', false, function(success){console.log('success': success)});
req.honeyTracks.trackVirtualCurrencyPurchase({'Name': 'Emeralds', 'Amount': 55.0}, 'CreditCard', 1.99, 'EUR', 1.438, 'EUR', false, function(success){console.log('success': success)});
```

#### trackVirtualGoodsFeaturePurchase
__https://docs.honeytracks.com/wiki/TrackVirtualGoodsFeaturePurchase/PHP__  
Tracks a purchase of a virtual goods feature, e.g. reset a block time for the next fight, finish a construction without waiting, etc..
```
req.honeyTracks.trackVirtualGoodsFeaturePurchase('SpecialFight', 'PvP', 50, null, 1, false, function(success){console.log('success': success)});
req.honeyTracks.trackVirtualGoodsFeaturePurchase('SpecialFight', 'PvP', {'Name': 'Emeralds', 'Amount': 50}, null, 1, false, function(success){console.log('success': success)});
```

#### trackVirtualGoodsItemPurchase
__https://docs.honeytracks.com/wiki/TrackVirtualGoodsItemPurchase/PHP__  
Tracks the purchase of an item, e.g. a sword, a pant or something like that, but this is not limited to these kind of items.
```
req.honeyTracks.trackVirtualGoodsItemPurchase('sword', {'UniqueId': 'SWORD_TYPE_01','Name': 'Sword of might', 'ImageUrl': 'http://path.to/item/image.png'}, 225, null, 1, false, function(success){console.log('success': success)});
req.honeyTracks.trackVirtualGoodsItemPurchase('sword',
  {
    'UniqueId': 'SWORD_TYPE_01',
    'Name': 'Sword of might',
    'ImageUrl': 'http://path.to/item/image.png'
  },
  {'Name': 'Emeralds', 'Amount': 225},
  null, // game currency currently not available
  1,
  false,
  function(success){console.log('success': success)}
);
```

#### trackVirtualCurrencyChargeback
__https://docs.honeytracks.com/wiki/TrackVirtualCurrencyChargeback/PHP__  
Tracks a chargeback of a virtual currency purchase, e.g. if a credit card transaction failed. The revenue and payout amounts have to be always positive.
```
req.honeyTracks.trackVirtualCurrencyChargeback( 
  55.0, 'CreditCard', 1.99, 'EUR', 1.438, 'EUR', false, function(success){console.log('success': success)}
);
req.honeyTracks.trackVirtualCurrencyChargeback( 
  {'Name': 'Emeralds', 'Amount': 55.0}, 'CreditCard', 1.99, 'EUR', 1.438, 'EUR', false, function(success){console.log('success': success)}
);
```

