const crypto = require('crypto')

module.exports = {
  afterSerialization(text) {
    const iv = crypto.randomBytes(16)
    const aes = crypto.createCipheriv(
      'aes-256-cbc',
      process.env.REDIS_ENCRYPTION_KEY,
      iv
    )
    let ciphertext = aes.update(text)
    ciphertext = Buffer.concat([iv, ciphertext, aes.final()])
    return ciphertext.toString('base64')
  },

  beforeDeserialization(ciphertext) {
    const ciphertextBytes = Buffer.from(ciphertext, 'base64')
    const iv = ciphertextBytes.slice(0, 16)
    const data = ciphertextBytes.slice(16)
    const aes = crypto.createDecipheriv(
      'aes-256-cbc',
      process.env.REDIS_ENCRYPTION_KEY,
      iv
    )
    let plaintextBytes = Buffer.from(aes.update(data))
    plaintextBytes = Buffer.concat([plaintextBytes, aes.final()])
    return plaintextBytes.toString()
  },

  sha265Hash(plainToken){
    var hmac = crypto.createHmac('sha256', process.env.WEBHOOK_SECRET_TOKEN);
    //passing the data to be hashed
    data = hmac.update(plainToken);
    //Creating the hmac in the required format
    return data.digest('hex');
  }
}
