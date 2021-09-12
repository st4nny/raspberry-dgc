const fetch = require('node-fetch');
const cron = require('node-cron');
const http = require('http');
const url = require('url');
const { DCC } = require('dcc-utils');
const rs = require('jsrsasign');
const vaccination = require("./vaccination.js")
const test = require("./test.js")
const recovery = require("./recovery.js")

const port = 3000;

const urlUpdate = "https://get.dgc.gov.it/v1/dgc/signercertificate/update";
const urlStatus = "https://get.dgc.gov.it/v1/dgc/signercertificate/status";
const urlSettings = "https://get.dgc.gov.it/v1/dgc/settings";
let validKids;
let signerCertificates;
let settings;

const updateCertificates = (async () => {

	console.log("Updating signer certificates...");

	// get the list of valid KIDs
	response = await fetch(urlStatus);
	validKids = await response.json();
	
	console.log("List of valid\ KIDs downloaded, " + validKids.length);
	
	// get the list of certificates
	signerCertificates = [];
	let headers = {};
	do {
		response = await fetch(urlUpdate, {
			headers,
		})
		headers = {'X-RESUME-TOKEN' : response.headers.get('X-RESUME-TOKEN')};
		const certificateKid = response.headers.get('X-KID');
		if(validKids.includes(certificateKid)) {
			const certificate = await response.text();
			signerCertificates.push("-----BEGIN CERTIFICATE-----\n" + certificate + "-----END CERTIFICATE-----");
		}
		else {			
			console.log("Certificate " + certificateKid + " is NOT valid");
		}
	} while (response.status === 200);
	console.log("Done");
});

const updateSettings = (async () => {

	console.log("Updating settings...");

	response = await fetch(urlSettings);
	settings = await response.json();
	
	console.log("Done");
});

const main = (async () => {

	//await updateCertificates();
	await updateSettings();

	const server = http.createServer();
	server.on('request', async (req, res) => {
		
		const dgc = url.parse(req.url, true).query.dgc;
		
		if(dgc === undefined) {
			res.statusCode = 400;
			res.setHeader('Content-Type', 'text/plain');
			res.end("Invalid DGC");
		}
		else {
			
			// init DCC library
			let dcc;
			try {
				dcc = await DCC.fromRaw(dgc);
			
			// error when decoding DGC
			} catch (e) {
			
				res.statusCode = 400;
				res.setHeader('Content-Type', 'text/plain');
				res.end("INVALID: " + e.message);
				return;		 
			}
			
			//console.log(dcc.payload);
			
			// check DGC signature
			/*let signatureVerified = false;
			for(let certificate of signerCertificates) {
							
				try {
					const verifier = rs.KEYUTIL.getKey(certificate).getPublicKeyXYHex();
					signatureVerified = await dcc.checkSignature(verifier);
				} catch {}
				if(signatureVerified) break;
			}
			
			// no signer certificate found
			if(!signatureVerified) {
			
				res.statusCode = 400;
				res.setHeader('Content-Type', 'text/plain');
				res.end("INVALID: signature");
				return;					
			}
			*/
			// check DGC content
			let validate;
			
			// 1. vaccination
			if(dcc.payload.v) validate = vaccination.validateVaccination(settings, dcc);
			
			// 2. test
			if(dcc.payload.t) validate = test.validateTest(settings, dcc);
			
			// 3. recovery
			if(dcc.payload.r) validate = recovery.validateRecovery(settings, dcc);
						
			if(validate.result) res.statusCode = 200;
			else res.StatusCode = 400;
			res.setHeader('Content-Type', 'text/plain');
			res.end(validate.message);				
		}
	});

	server.listen(port, () => {
	  console.log("validatorServer running");
	});
});

main();