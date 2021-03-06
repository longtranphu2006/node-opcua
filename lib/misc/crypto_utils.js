/**
 * @module opcua.miscellaneous
 * @class CryptoUtils
 *
 * @static
 */
var crypto_utils = exports;

var fs = require("fs");
var crypto = require("crypto");
var assert = require("better-assert");
var _ = require("underscore");
var jsrsasign = require("node-jsrsasign");

require("colors");

var PEM_REGEX = /^(-----BEGIN (.*)-----\r?\n[\/+=a-zA-Z0-9\r\n]*\r?\n-----END \2-----\r?\n)/m;

// Copyright 2012 The Obvious Corporation.
// identifyPemType
/**
 * Extract and identify the PEM file type represented in the given
 * buffer. Returns the extracted type string or undefined if the
 * buffer doesn't seem to be any sort of PEM format file.
 */
function identifyPemType(raw_key) {
    if (raw_key instanceof Buffer) {
        raw_key = raw_key.toString("utf8");
    }
    var match = PEM_REGEX.exec(raw_key);
    return !match ? undefined : match[2];
}

function readKeyPem(filename) {
    var raw_key = fs.readFileSync(filename, "utf8");
    var pemType = identifyPemType(raw_key);
    assert(typeof pemType === "string"); // must have a valid pem type
    return raw_key;
}
exports.readKeyPem = readKeyPem;

function readPEM(raw_key) {

    var pemType = identifyPemType(raw_key);
    if (pemType) {
        // pemType shall be "RSA PRIVATE KEY" , "PUBLIC KEY", "CERTIFICATE"
        var key = raw_key.toString('utf8');
        var a = key.split("\n");
        var base64Str = "";
        for (var i = 1; i < a.length - 2; i += 1) {
            base64Str = base64Str + a[i];
        }
        return new Buffer(base64Str, "base64");
    } else {
        return new Buffer(raw_key);
    }
}
function readCertificate(filename) {

    assert(typeof(filename) === "string");
    var raw_key = fs.readFileSync(filename);
    return readPEM(raw_key);
}

exports.readKey = readCertificate;
exports.readCertificate = readCertificate;


/**
 * @method toPem
 * @param raw_key
 * @param pem
 * @return {*}
 */
function toPem(raw_key, pem) {
    assert(typeof(pem) === "string");
    var pemType = identifyPemType(raw_key);
    if (pemType) {
        return raw_key;
    } else {
        pemType = pem;
        assert(["CERTIFICATE", "RSA PRIVATE KEY", "PUBLIC KEY"].indexOf(pemType) >= 0);
        var b = raw_key.toString("base64");
        var str = "-----BEGIN " + pemType + "-----\n";
        while (b.length) {
            str += b.substr(0, 64) + "\n";
            b = b.substr(64);
        }
        str += "-----END " + pemType + "-----";
        str += "\n";
        return str;
    }
}
exports.toPem = toPem;

/**
 * @method makeMessageChunkSignature
 * @param chunk
 * @param options {Object}
 * @param options.signatureLength {Number}
 * @param options.algorithm {String}   for example "RSA-SHA256"
 * @param options.privateKey {Buffer}
 * @return {Buffer} - the signature
 */
function makeMessageChunkSignature(chunk, options) {

    assert(chunk instanceof Buffer);
    assert(identifyPemType(options.privateKey) === "RSA PRIVATE KEY");
    // signature length = 128 bytes
    var signer = crypto.createSign(options.algorithm);
    signer.update(chunk);
    var signature = signer.sign(options.privateKey, 'binary');
    //xx console.log("signature.length = ",signature.length);
    assert(!options.signatureLength || signature.length === options.signatureLength);

    return new Buffer(signature, "binary"); // Buffer
}
exports.makeMessageChunkSignature = makeMessageChunkSignature;

/**
 * @method verifyMessageChunkSignature
 *
 *     var signer = {
 *           signatureLength : 128,
 *           algorithm : "RSA-SHA256",
 *           public_key: "qsdqsdqsd"
 *     };
 * @param block_to_verify {Buffer}
 * @param signature {Buffer}
 * @param options {Object}
 * @param options.signatureLength {Number}
 * @param options.algorithm {String}   for example "RSA-SHA256"
 * @param options.publicKey {Buffer}*
 * @return {Boolean} - true if the signature is valid
 */
exports.verifyMessageChunkSignature = function (block_to_verify, signature, options) {

    assert(block_to_verify instanceof Buffer);
    assert(signature       instanceof Buffer);
    assert(typeof options.publicKey === 'string');
    assert(identifyPemType(options.publicKey));

    var verify = crypto.createVerify(options.algorithm);
    verify.update(block_to_verify, "binary");

    return verify.verify(options.publicKey, signature);

};

/**
 * @method verifyChunkSignature
 *
 *     var signer = {
 *           signatureLength : 128,
 *           algorithm : "RSA-SHA256",
 *           public_key: "qsdqsdqsd"
 *     };
 *
 * @param chunk {Buffer} The message chunk to verify.
 * @param options {Object}
 * @param options.signatureLength {Number}
 * @param options.algorithm {String} the algorithm.
 * @param options.publicKey {Buffer}
 * @return {*}
 */
function verifyChunkSignature(chunk, options) {

    assert(chunk instanceof Buffer);
    var signatureLength = options.signatureLength;
    if (!signatureLength) {
        // let's get the signatureLength by checking the size
        // of the certificate's public key
        var cert = crypto_utils.exploreCertificate(options.publicKey);
        signatureLength = cert.publicKeyLength; // 1024 bits = 128Bytes or 2048=256Bytes
    }
    var block_to_verify = chunk.slice(0, chunk.length - signatureLength);
    var signature = chunk.slice(chunk.length - signatureLength);
    return exports.verifyMessageChunkSignature(block_to_verify, signature, options);
}
exports.verifyChunkSignature = verifyChunkSignature;


function makeSHA1Thumbprint(buffer) {

    var digest = crypto.createHash('sha1').update(buffer).digest("binary");
    return new Buffer(digest, "binary");
}
exports.makeSHA1Thumbprint = makeSHA1Thumbprint;


var sshKeyToPEM = require('ssh-key-to-pem');

//xx var  __certificate_store = __dirname + "/helpers/";
var __certificate_store = __dirname + "/../../certificates/";

exports.setCertificateStore = function (store) {
    var old_store = __certificate_store;
    __certificate_store = store;
    return old_store;
};

function read_sshkey_as_pem(filename) {

    if (filename.substr(0, 1) !== '.') {
        filename = __certificate_store + filename;
    }
    var key = fs.readFileSync(filename, "ascii");
    key = sshKeyToPEM(key);
    return key;
}
exports.read_sshkey_as_pem = read_sshkey_as_pem;

function read_private_rsa_key(filename) {
    if (filename.substr(0, 1) !== '.'  && !fs.existsSync(filename)) {
        filename = __certificate_store + filename;
    }
    var key = fs.readFileSync(filename, "ascii");
    return key;
}
exports.read_private_rsa_key = read_private_rsa_key;

exports.read_public_rsa_key = function (filename) {
    return read_private_rsa_key(filename);
};


//======================================================================================================================

function display_public_key_Encryption_missing_message() {
    console.warn("\n Warning : your version of node doesn't provide crypto.publicEncrypt yet ".yellow, process.version);
    console.warn("           This should be sorted out in node > 0.12".cyan);
    console.warn("           require('ursa') doesn't seem to be installed either or is not compatible".yellow);
    console.warn("");
    console.warn("           this can be sorted by running the following command in root mode".yellow);
    console.warn("              $ npm install -g ursa".yellow.bold);
    console.warn("");
}

// Basically when you =encrypt something using an RSA key (whether public or private), the encrypted value must
// be smaller than the key (due to the maths used to do the actual encryption). So if you have a 1024-bit key,
// in theory you could encrypt any 1023-bit value (or a 1024-bit value smaller than the key) with that key.
// However, the PKCS#1 standard, which OpenSSL uses, specifies a padding scheme (so you can encrypt smaller
// quantities without losing security), and that padding scheme takes a minimum of 11 bytes (it will be longer
// if the value you're encrypting is smaller). So the highest number of bits you can encrypt with a 1024-bit
// key is 936 bits because of this (unless you disable the padding by adding the OPENSSL_NO_PADDING flag,
// in which case you can go up to 1023-1024 bits). With a 2048-bit key it's 1960 bits instead.

var ursa = null;
try {
    ursa = require("ursa");
    console.log("using URSA".cyan);
}
catch (err) {
    ursa = null;
}

var constants = require('constants');

var crypto_utils = exports;
exports.RSA_PKCS1_OAEP_PADDING = constants.RSA_PKCS1_OAEP_PADDING;
exports.RSA_PKCS1_PADDING = constants.RSA_PKCS1_PADDING;
if (ursa) {
    exports.RSA_PKCS1_OAEP_PADDING = ursa.RSA_PKCS1_OAEP_PADDING;
    exports.RSA_PKCS1_PADDING = ursa.RSA_PKCS1_PADDING;
}
//xx console.log("xxxxxxxxxxxx exports.RSA_PKCS1_PADDING",exports.RSA_PKCS1_PADDING,ursa.RSA_PKCS1_PADDING,constants.RSA_PKCS1_PADDING);
//xx console.log("xxxxxxxxxxxx exports.RSA_PKCS1_OAEP_PADDING",exports.RSA_PKCS1_OAEP_PADDING,ursa.RSA_PKCS1_OAEP_PADDING,constants.RSA_PKCS1_OAEP_PADDING);

// publicEncrypt and  privateDecrypt only work with
// small buffer that depends of the key size.
function publicEncrypt_native(buffer, public_key, algorithm) {

    algorithm = algorithm || crypto_utils.RSA_PKCS1_PADDING;
    assert(algorithm === crypto_utils.RSA_PKCS1_PADDING || algorithm === crypto_utils.RSA_PKCS1_OAEP_PADDING);
    assert(buffer instanceof Buffer, "Expecting a buffer");

    return crypto.publicEncrypt({
        key: public_key,
        padding: algorithm
    }, buffer);
}
function publicEncrypt_ursa(buffer, public_key, algorithm) {

    algorithm = algorithm || crypto_utils.RSA_PKCS1_PADDING;
    assert(algorithm === crypto_utils.RSA_PKCS1_PADDING || algorithm === crypto_utils.RSA_PKCS1_OAEP_PADDING);
    assert(buffer instanceof Buffer, "Expecting a buffer");
    assert(ursa);
    var crt = ursa.createPublicKey(public_key);
    buffer = crt.encrypt(buffer, undefined, undefined, algorithm);
    return buffer;
}

function privateDecrypt_native(buffer, private_key, algorithm) {
    algorithm = algorithm || crypto_utils.RSA_PKCS1_PADDING;
    assert(algorithm === crypto_utils.RSA_PKCS1_PADDING || algorithm === crypto_utils.RSA_PKCS1_OAEP_PADDING);
    assert(buffer instanceof Buffer, "Expecting a buffer");
    return crypto.privateDecrypt({
        key: private_key,
        padding: algorithm
    }, buffer);
}

function privateDecrypt_ursa(buffer, private_key, algorithm) {
    algorithm = algorithm || crypto_utils.RSA_PKCS1_PADDING;
    assert(algorithm === crypto_utils.RSA_PKCS1_PADDING || algorithm === crypto_utils.RSA_PKCS1_OAEP_PADDING);
    assert(buffer instanceof Buffer, "Expecting a buffer");
    assert(ursa);
    //xx console.log( " BUFF ER L =",buffer.length);
    var key = ursa.createPrivateKey(private_key);
    //xx assert(key.isPrivateKey());
    // buffer = key.decrypt(buffer, undefined, undefined, ursa.RSA_PKCS1_PADDING);
    buffer = key.decrypt(buffer, undefined, undefined, algorithm);
    //xx buffer = key.decrypt(buffer);
    return buffer;
}

function publicEncrypt_long(buffer, key, block_size, padding, algorithm) {
    algorithm = algorithm || crypto_utils.RSA_PKCS1_PADDING;
    assert(algorithm === crypto_utils.RSA_PKCS1_PADDING || algorithm === crypto_utils.RSA_PKCS1_OAEP_PADDING);

    exports.ensure_crypto_installed();

    var chunk_size = block_size - padding;
    var nbBlocks = Math.ceil(buffer.length / (chunk_size));

    var outputBuffer = new Buffer(nbBlocks * block_size);
    for (var i = 0; i < nbBlocks; i++) {
        var currentBlock = buffer.slice(chunk_size * i, chunk_size * (i + 1));
        var encrypted_chunk = publicEncrypt(currentBlock, key, algorithm);
        assert(encrypted_chunk.length === block_size);
        encrypted_chunk.copy(outputBuffer, i * block_size);
    }
    return outputBuffer;
}

function privateDecrypt_long(buffer, key, block_size, algorithm) {

    algorithm = algorithm || crypto_utils.RSA_PKCS1_PADDING;
    assert(algorithm === crypto_utils.RSA_PKCS1_PADDING || algorithm === crypto_utils.RSA_PKCS1_OAEP_PADDING);

    exports.ensure_crypto_installed();

    var nbBlocks = Math.ceil(buffer.length / (block_size));

    var outputBuffer = new Buffer(nbBlocks * block_size);

    var total_length = 0;
    for (var i = 0; i < nbBlocks; i++) {
        var currentBlock = buffer.slice(block_size * i, Math.min(block_size * (i + 1), buffer.length));
        var decrypted_buf = privateDecrypt(currentBlock, key, algorithm);
        decrypted_buf.copy(outputBuffer, total_length);
        total_length += decrypted_buf.length;
    }
    return outputBuffer.slice(0, total_length);

}


exports.isFullySupported = function () {
    var has_RSA = (exports.RSA_PKCS1_OAEP_PADDING && exports.RSA_PKCS1_PADDING );
    return has_RSA && (ursa || crypto.hasOwnProperty("publicEncrypt"));
};

exports.ensure_crypto_installed = function ensure_crypto_installed(optional_callback) {

    var message = "Missing crypto";
    if (!exports.isFullySupported()) {
        display_public_key_Encryption_missing_message();
        if (optional_callback) {
            optional_callback(new Error(message));
            return false;
        } else {
            throw new Error(message);
        }
    }
    return true;
};

var publicEncrypt = null;
var privateDecrypt = null;
if (!exports.isFullySupported()) {
    display_public_key_Encryption_missing_message();
} else {
    publicEncrypt = crypto.hasOwnProperty("publicEncrypt") ? publicEncrypt_native : publicEncrypt_ursa;
    privateDecrypt = crypto.hasOwnProperty("publicEncrypt") ? privateDecrypt_native : privateDecrypt_ursa;
}


exports.publicEncrypt = publicEncrypt;
exports.publicEncrypt_long = publicEncrypt_long;
exports.privateDecrypt = privateDecrypt;
exports.privateDecrypt_long = privateDecrypt_long;


/***
 * A very expensive way to determine the rsa key length ( i.e 2048bits or 1024bits)
 * @param key {string} a PEM public key or a PEM rsa private key
 * @returns {int} the key length in bytes.
 */
exports.rsa_length = function (key) {

    assert( !(key instanceof Buffer)," buffer is not allowed");
    var a = jsrsasign.KEYUTIL.getKey(key);
    return a.n.toString(16).length / 2;
    // console.log('xxxx ',a.n.toString(16).length, a.n.toString(16));
    // // todo: this will fail with URSA and a private key
    // var b = publicEncrypt(new Buffer(1), key);
    //xx console.log("xxxxxx key",key.length,b.length);
    // return b.length;


};

var sample_Certificate = {

    version: 2,
    subject: {
        countryName: 'FR',
        stateOrProvinceName: 'NA',
        localityName: 'Ici',
        organizationName: 'ACME',
        organizationalUnitName: 'qq',
        commonName: 'UaExpert'
    },
    issuer: {
        countryName: 'FR',
        stateOrProvinceName: 'NA',
        localityName: 'Paris',
        organizationName: 'ACME',
        organizationalUnitName: 'ACMELab',
        commonName: 'Node-Opcua'
    },
    serial: '530C628D',
    notBefore: new Date("Tue Feb 25 2014 10:29:49 GMT+0100 (Paris, Madrid)"),
    notAfter: new Date("Wed Feb 25 2015 10:29:49 GMT+0100 (Paris, Madrid)"),
    signatureAlgorithm: 'sha1WithRSAEncryption',
    fingerPrint: 'C8:A7:BB:DE:AD:BE:EF:91:51:AD:8A:A2:E8:7D:5D:56:59:70:42:5A',
    publicKey: {
        algorithm: 'rsaEncryption',
        e: '65537',
        n: 'E7520EA0F268DEAAC4486AAB6B7E2253FE6848A2D759A46E2E12B3272CAE1DD8AED0B57260EE132DAA3307BD9670D28111552C0' +
        'AA58B3B693937723DB5A87946C89C6275D9CB5FCF6083459CD085A427E52841B77BD9EAC2812622390BE7AC0411653826EF0A83' +
        '3E184788F74FA360C758F3D5232D973F9323D6CD5EA0EA568D'
    },
    altNames: ['XXXXX'],
    extensions: {
        basicConstraints: 'CA:FALSE',
        netscapeComment: '"Generated with .... ',
        subjectKeyIdentifier: '.....',
        authorityKeyIdentifier: '',
        keyUsage: 'Digital Signature, Non Repudiation, Key Encipherment, Data Encipherment, Certificate Signxpert',
        extendedKeyUsage: 'TLS Web Server Authentication, TLS Web Client Authentication',
        subjectAlternativeName: 'URI:urn:..., DNS:...'
    }
};

/**
 * @method exploreCertificate
 * @param certificate
 * @return object.publicKeyLength
 * @return object.notBefore
 * @return object.notAfter
 */
exports.exploreCertificate = function (certificate) {

    // find the public key length
    // $ openssl rsa -in secret.key -text -noout | grep "Private-Key"
    var senderCertificatePem = certificate;
    if (certificate instanceof Buffer) {
        senderCertificatePem = crypto_utils.toPem(certificate, "CERTIFICATE");
    }
    var data;


    //if (false) {
    //    var today = new Date();
    //     data = {
    //        publicKeyLength:  (certificate.length > 1000 ) ? 256  : 128,
    //        notBefore: new Date(today.getTime() - 100000000),
    //        notAfter: new Date(today.getTime()  + 100000000)
    //    };
    //}
    if (true) {
        var x509 = new jsrsasign.X509();
        x509.readCertPEM(senderCertificatePem);

        //xx console.log(" using node-jsrsasign",certificate.length, x509.subjectPublicKeyRSA_hN.length / 2 - 1);
        data = {
            publicKeyLength: x509.subjectPublicKeyRSA_hN.length / 2 - 1,
            notBefore: new Date(parseInt(x509.getNotBefore()) * 10),
            notAfter: new Date(parseInt(x509.getNotAfter()) * 10)
        };
        assert(data.publicKeyLength === 256 || data.publicKeyLength === 128);
        //xx var t = exports.extractPublicKeyFromCertificateSync(senderCertificatePem);
        //xx var l = exports.rsa_length(t);
        //xx assert(l === data.publicKeyLength);

    } else {
        console.log(" using x509");
        var x509 = require('x509');
        data = x509.parseCert(senderCertificatePem);
        data.publicKeyLength = data.publicKey.n.length / 2.0;
    }
    //xx console.log("xxxx publicKeyLength=",data.publicKeyLength);
    //xx console.log("xxxx notBefore=",data.notBefore);
    //xx console.log("xxxx notAfter=",data.notAfter);
    return data;
};

/**
 * extract the publickey from a certificate - using the pem module
 *
 * @method extractPublicKeyFromCertificate_WithPem
 * @async
 * @param certificate
 * @param callback {Function}
 * @param callback.err
 * @param callback.publicKey as pem
 */
exports.extractPublicKeyFromCertificate_WithPem = function (certificate, callback) {

    var err1 = new Error();
    var cert_pem = crypto_utils.toPem(certificate, "CERTIFICATE");
    require("pem").getPublicKey(cert_pem, function (err, data) {
        if (err) {
            console.log(err1.stack);
            console.log(" CANNOT EXTRAT PUBLIC KEY from Certificate".red, certificate);
            return callback(err);
        }
        callback(err, data.publicKey);
    });
};

exports.extractPublicKeyFromCertificateSync = function (certificate) {

    if (certificate instanceof Buffer) {
        certificate = crypto_utils.toPem(certificate, "CERTIFICATE");
    }
    assert(typeof certificate === "string");

    var key = jsrsasign.KEYUTIL.getKey(certificate);
    var keyPem = jsrsasign.KEYUTIL.getPEM(key);

    return keyPem;
};

// https://github.com/kjur/jsrsasign/blob/master/x509-1.1.js
// tool to analyse asn1 base64 blocks : http://lapo.it/asn1js
/**
 * extract the publickey from a certificate
 * @method extractPublicKeyFromCertificate
 * @async
 * @param certificate
 * @param callback {Function}
 * @param callback.err
 * @param callback.publicKey as pem
 */
exports.extractPublicKeyFromCertificate = function (certificate, callback) {

    var err1 = null, keyPem;
    try {
        keyPem = exports.extractPublicKeyFromCertificateSync(certificate);
    }
    catch (err) {
        err1 = err;
    }
    setImmediate(function () {
        callback(err1, keyPem);
    });


};

// OPC-UA Spec 1.02 part 6 - 6.7.5  Deriving Keys page 42
// Once the  SecureChannel  is established the  Messages  are signed and encrypted with keys derived
// from the  Nonces  exchanged in t he  OpenSecureChannel  call. These keys are derived by passing the
// Nonces  to a pseudo - random function which produces a sequence of bytes from a set of inputs.   A
// pseudo- random function  is represented by the following function declaration:
// Byte[] PRF(
//     Byte[] secret,
//    Byte[] seed,
//    Int32 length,
//    Int32 offset)
//Where length   is the number of bytes to return and  offset  is a number of bytes from the beginning of
//the sequence.
// The lengths of the keys that need to be generated depend on the  SecurityPolicy  used for the
//    channel. The following information is specified by the  SecurityPolicy:
//    a)  SigningKeyLength  (from the  DerivedSignatureKeyLength);
//    b)  EncryptingKeyLength  (implied by the  SymmetricEncryptionAlgorithm);
//    c)  EncryptingBlockSize  (implied by the  SymmetricEncryptionAlgorithm).
//  The parameters  passed to the pseudo random function are specified in  Table 36.
//  Table 36  - Cryptography Key Generation Parameters
//
// Key                         Secret       Seed         Length               Offset
// ClientSigningKey            ServerNonce  ClientNonce  SigningKeyLength     0
// ClientEncryptingKey         ServerNonce  ClientNonce  EncryptingKeyLength  SigningKeyLength
// ClientInitializationVector  ServerNonce  ClientNonce  EncryptingBlockSize  SigningKeyLength+ EncryptingKeyLength
// ServerSigningKey            ClientNonce  ServerNonce  SigningKeyLength     0
// ServerEncryptingKey         ClientNonce  ServerNonce  EncryptingKeyLength  SigningKeyLength
// ServerInitializationVector  ClientNonce  ServerNonce  EncryptingBlockSize  SigningKeyLength+ EncryptingKeyLength
//
// The  Client  keys are used to secure  Messages  sent by the  Client. The  Server  keys are used to
// secure Messages  sent by the  Server.
// The SSL/TLS  specification  defines a pseudo random function called P_SHA1   which is used for some
//     SecurityProfiles. The P_SHA1  algorithm is defined as follows:
//     P_SHA1(secret, seed) = HMAC_SHA1(secret, A(1) + seed) +
//     HMAC_SHA1(secret, A(2) + seed) +
//     HMAC_SHA1(secret, A(3) + seed) + ...
// Where A(n) is defined as:
//      A(0) = seed
//      A(n) = HMAC_SHA1(secret, A(n-1))
//           + indicates that the results are appended to previous results.
//
// see also http://docs.oasis-open.org/ws-sx/ws-secureconversation/200512/ws-secureconversation-1.3-os.html
//          http://csrc.nist.gov/publications/fips/fips180-4/fips-180-4.pdf
function makePseudoRandomBuffer(secret, seed, minLength) {

    function HMAC_SHA1(secret, message) {
        return crypto.createHmac("SHA1", secret).update(message).digest();
    }

    function plus(buf1, buf2) {
        return Buffer.concat([buf1, buf2]);
        ///xx var ret = new Buffer(buf1.length+ buf2.length);
        ///xx buf1.copy(ret,0);
        ///xx buf2.copy(ret,buf1.length);
        ///xx return ret;
    }

    assert(seed instanceof Buffer);
    var a = [];
    a[0] = seed;
    var index = 1;
    var p_sha1 = new Buffer(0);
    while (p_sha1.length <= minLength) {
        a[index] = HMAC_SHA1(secret, a[index - 1]);
        p_sha1 = plus(p_sha1, HMAC_SHA1(secret, plus(a[index], seed)));
        index += 1;
    }
    return p_sha1.slice(0, minLength);
}
exports.makePseudoRandomBuffer = makePseudoRandomBuffer;

function computeDerivedKeys(secret, seed, options) {
    assert(_.isFinite(options.signatureLength));
    assert(_.isFinite(options.encryptingKeyLength));
    assert(_.isFinite(options.encryptingBlockSize));
    assert(typeof options.algorithm === "string");

    var offset1 = options.signingKeyLength;
    var offset2 = offset1 + options.encryptingKeyLength;
    var offset3 = offset2 + options.encryptingBlockSize;
    var minLength = offset3;
    var buf = makePseudoRandomBuffer(secret, seed, minLength);

    return {
        signingKey: buf.slice(0, offset1),
        encryptingKey: buf.slice(offset1, offset2),
        initializationVector: buf.slice(offset2, offset3),
        signingKeyLength: options.signingKeyLength,
        encryptingKeyLength: options.encryptingKeyLength,
        encryptingBlockSize: options.encryptingBlockSize,
        signatureLength: options.signatureLength,
        algorithm: options.algorithm
    };
}
exports.computeDerivedKeys = computeDerivedKeys;

function computePaddingFooter(buffer, derivedKeys) {

    assert(derivedKeys.hasOwnProperty("encryptingBlockSize"));
    var paddingSize = derivedKeys.encryptingBlockSize - ( buffer.length + 1 ) % derivedKeys.encryptingBlockSize;
    var padding = new Buffer(paddingSize + 1);
    padding.fill(paddingSize);
    return padding;
    //xx encrypted_chunks.push(cypher.update(padding));
}
exports.computePaddingFooter = computePaddingFooter;

function derivedKeys_algorithm(derivedKeys) {
    assert(derivedKeys.hasOwnProperty("algorithm"));
    var algorithm = derivedKeys.algorithm || "aes-128-cbc";
    assert(algorithm === "aes-128-cbc" || algorithm === "aes-256-cbc");
    return algorithm;

}
function encryptBufferWithDerivedKeys(buffer, derivedKeys) {

    //xx console.log("xxxxx ",derivedKeys);
    var algorithm = derivedKeys_algorithm(derivedKeys);
    var key = derivedKeys.encryptingKey;
    var initVector = derivedKeys.initializationVector;
    var cypher = crypto.createCipheriv(algorithm, key, initVector);

    cypher.setAutoPadding(false);

    var encrypted_chunks = [];
    encrypted_chunks.push(cypher.update(buffer));
    encrypted_chunks.push(cypher.final());

    var encrypted_message = Buffer.concat(encrypted_chunks);

    return encrypted_message;
}
exports.encryptBufferWithDerivedKeys = encryptBufferWithDerivedKeys;

function decryptBufferWithDerivedKeys(buffer, derivedKeys) {

    var algorithm = derivedKeys_algorithm(derivedKeys);

    //xx console.log("xxxxx ",algorithm,derivedKeys);

    var key = derivedKeys.encryptingKey;
    var initVector = derivedKeys.initializationVector;
    var cypher = crypto.createDecipheriv(algorithm, key, initVector);

    cypher.setAutoPadding(false);

    var decrypted_chunks = [];
    decrypted_chunks.push(cypher.update(buffer));
    decrypted_chunks.push(cypher.final());

    return Buffer.concat(decrypted_chunks);
}

exports.decryptBufferWithDerivedKeys = decryptBufferWithDerivedKeys;


/**
 * @method makeMessageChunkSignatureWithDerivedKeys
 * @param message {Buffer}
 * @param derivedKeys
 * @return {Buffer}
 */
function makeMessageChunkSignatureWithDerivedKeys(message, derivedKeys) {

    assert(message instanceof Buffer);
    assert(derivedKeys.signingKey instanceof Buffer);
    var signature = crypto.createHmac("SHA1", derivedKeys.signingKey).update(message).digest();
    assert(signature.length = derivedKeys.signatureLength);
    return signature;
}
exports.makeMessageChunkSignatureWithDerivedKeys = makeMessageChunkSignatureWithDerivedKeys;


/**
 * @method verifyChunkSignatureWithDerivedKeys
 * @param chunk
 * @param derivedKeys
 * @return {boolean}
 */
function verifyChunkSignatureWithDerivedKeys(chunk, derivedKeys) {

    var message = chunk.slice(0, chunk.length - derivedKeys.signatureLength);
    var signature = chunk.slice(chunk.length - derivedKeys.signatureLength);
    var verif = makeMessageChunkSignatureWithDerivedKeys(message, derivedKeys);
    return verif.toString("hex") === signature.toString("hex");
}
exports.verifyChunkSignatureWithDerivedKeys = verifyChunkSignatureWithDerivedKeys;

/**
 * @method reduceLength
 * @param buffer {Buffer}
 * @param byte_to_remove  {number}
 * @return {Buffer}
 */
function reduceLength(buffer, byte_to_remove) {
    return buffer.slice(0, buffer.length - byte_to_remove);
}
exports.reduceLength = reduceLength;

/**
 *
 * @param buffer {Buffer}
 * @return {Buffer}
 */
function removePadding(buffer) {
    var nbPaddingBytes = buffer.readUInt8(buffer.length - 1) + 1;
    return reduceLength(buffer, nbPaddingBytes);
}
exports.removePadding = removePadding;

