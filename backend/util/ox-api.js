const axios = require('axios')

module.exports = {
    async sendMomentData2Ox(data) {
        return await axios({
            url: `${process.env.OX_HOST}/zoom/webhookdata`,
            method: 'POST',
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
              'user-agent': 'Ox-Zoom Marketplace/1.0a'
            },
            data,
          })
    }
}