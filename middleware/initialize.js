
module.exports = function (usesCookies, expireDays) {
    if(!usesCookies) usesCookies = false;
    if(!expireDays) expireDays = 14;
    
    var honeyTracks = this;
    return function (req, res, next) {
        req.honeyTracks = honeyTracks;
        honeyTracks.setClientIP(req);
        
        if(usesCookies){
            if(!req.cookies.htctr){
                var customerClickToken = require("guid").raw();
    			honeyTracks.setUniqueCustomerClickToken(customerClickToken, true);
                res.cookie('htctr', new Buffer(customerClickToken).toString('base64'), { expires: new Date(Date.now() + 86400 * 1000 * expireDays), path: '/' });
            } else {
                honeyTracks.setUniqueCustomerClickToken(new Buffer(req.cookies['htctr'], 'base64').toString('ascii'), false);
            }
        }
        
        res.on("finish", function() {
            //honeyTracks.commit(function(){});
        });
        
        next();
    }
}