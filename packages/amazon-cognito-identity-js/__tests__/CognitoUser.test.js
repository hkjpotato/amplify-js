import CognitoUser from '../src/CognitoUser';

import CognitoUserPool from '../src/CognitoUserPool';
import AuthenticationDetails from '../src/AuthenticationDetails';
import Client from '../src/Client';

import {
	clientId,
	userPoolId,
	authDetailData,
	authDetailDataWithValidationData,
	vCognitoUserSession,
	deviceName,
	totpCode,
	ivCognitoUserSession
} from './constants';


const minimalData = { UserPoolId: userPoolId, ClientId: clientId };
const cognitoUserPool = new CognitoUserPool(minimalData);

describe('CognitoUser constructor', () => {
	test('constructor throws error when bad (or no) data is passed', () => {
		const errorMsg = 'Username and Pool information are required.';

		// no data at all
		expect(() => {
			new CognitoUser({});
		}).toThrow(errorMsg);

		// missing Pool
		expect(() => {
			new CognitoUser({
				Username: 'username',
				Pool: null,
			});
		}).toThrow(errorMsg);

		// missing Username
		expect(() => {
			new CognitoUser({
				Username: null,
				Pool: userPoolId,
			});
		}).toThrow(errorMsg);
	});

	test('happy case constructor', () => {
		const spyon = jest.spyOn(cognitoUserPool, 'getClientId');

		expect(() => {
			new CognitoUser({
				Username: 'username',
				Pool: cognitoUserPool,
			});
		}).not.toThrowError();

		expect(spyon).toBeCalled();
	});
});

describe('getters and setters', () => {
	const user = new CognitoUser({
		Username: 'username',
		Pool: cognitoUserPool,
	});

	test('get and set SignInUserSession', () => {
		// initial state
		expect(user.getSignInUserSession()).toEqual(null);

		// setting explicitly
		user.setSignInUserSession(vCognitoUserSession);
		expect(user.signInUserSession).toEqual(vCognitoUserSession);

		// getter after set explicitly
		expect(user.getSignInUserSession()).toEqual(vCognitoUserSession);

	});

	test('getUsername()', () => {
		expect(user.getUsername()).toEqual(user.username);
	});

	test('get and set authenticationFlowType', () => {
		// initial state
		expect(user.getAuthenticationFlowType()).toEqual('USER_SRP_AUTH');

		// setting explicitly
		user.setAuthenticationFlowType('TEST_FLOW_TYPE');

		// getter after set explicitly
		expect(user.getAuthenticationFlowType()).toEqual('TEST_FLOW_TYPE');
	});
});

describe('initiateAuth()', () => {
	const callback = {
		onFailure: jest.fn(),
		onSuccess: jest.fn(),
		customChallenge: jest.fn(),
	};

	afterAll(() => {
		jest.restoreAllMocks();
	});

	afterEach(() => {
		callback.onFailure.mockClear();
		callback.onSuccess.mockClear();
		callback.customChallenge.mockClear();
	});

	test('Client request called once and throws an error', async () => {
		jest.spyOn(Client.prototype, 'request').mockImplementation((...args) => {
			const err = new Error('Test error');
			args[2](err, {});
		});

		const user = new CognitoUser({
			Username: 'username',
			Pool: cognitoUserPool,
		});
		const authDetails = new AuthenticationDetails(authDetailData);
		user.initiateAuth(authDetails, callback);

		expect(callback.onFailure.mock.calls.length).toBe(1);
		expect(callback.onSuccess.mock.calls.length).toBe(0);
	});

	test('Client request called once with challenge name and params', async () => {
		jest.spyOn(Client.prototype, 'request').mockImplementation((...args) => {
			args[2](null, {
				ChallengeName: 'CUSTOM_CHALLENGE',
				Session: vCognitoUserSession,
				ChallengeParameters: 'Custom challenge params',
			});
		});

		const user = new CognitoUser({
			Username: 'username',
			Pool: cognitoUserPool,
		});

		const authDetails = new AuthenticationDetails(authDetailData);
		user.initiateAuth(authDetails, callback);


		expect(user.Session).toMatchObject(vCognitoUserSession);
		expect(callback.customChallenge.mock.calls.length).toBe(1);
		expect(callback.customChallenge).toBeCalledWith('Custom challenge params');
	});

	test('Client request sets signInUserSession and is successful', async () => {
		jest.spyOn(Client.prototype, 'request').mockImplementation((...args) => {
			args[2](null, { AuthenticationResult: 'great success' });
		});

		const user = new CognitoUser({
			Username: 'username',
			Pool: cognitoUserPool,
		});

		const getCognitoUserSessionSpy = jest.spyOn(user, 'getCognitoUserSession');
		const cacheTokensSpy = jest.spyOn(user, 'cacheTokens');

		const authDetails = new AuthenticationDetails(authDetailData);
		user.initiateAuth(authDetails, callback);

		expect(getCognitoUserSessionSpy).toBeCalledWith('great success');
		expect(cacheTokensSpy).toBeCalled();
		expect(callback.onSuccess.mock.calls.length).toBe(1);
	});

	test('initiate auth with validation data', () => {
		const user = new CognitoUser({
			Username: 'username',
			Pool: cognitoUserPool,
		});
		const authDetails = new AuthenticationDetails(
			authDetailDataWithValidationData
		);

		user.initiateAuth(authDetails, callback);
	});
});

describe('authenticateUser()', () => {
	afterAll(() => {
		jest.restoreAllMocks();
	});

	const user = new CognitoUser({
		Username: 'username',
		Pool: cognitoUserPool,
	});
	const authDetails = new AuthenticationDetails(authDetailData);
	const callback = {
		onFailure: jest.fn(),
		onSuccess: jest.fn(),
		customChallenge: jest.fn(),
	};

	test('USER_PASSWORD_AUTH flow type', () => {
		const spyon = jest.spyOn(user, 'authenticateUserPlainUsernamePassword');

		user.setAuthenticationFlowType('USER_PASSWORD_AUTH');
		user.authenticateUser(authDetails, callback);

		expect(spyon).toHaveBeenCalledWith(authDetails, callback);
	});

	test('USER_SRP_AUTH and CUSTOM_AUTH flow types', () => {
		const spyon = jest.spyOn(user, 'authenticateUserDefaultAuth');

		user.setAuthenticationFlowType('USER_SRP_AUTH');
		user.authenticateUser(authDetails, callback);

		expect(spyon).toHaveBeenCalledWith(authDetails, callback);

		user.setAuthenticationFlowType('CUSTOM_AUTH');
		user.authenticateUser(authDetails, callback);

		expect(spyon).toHaveBeenCalledWith(authDetails, callback);
	});

	test('throws error for invalid Authentication flow type', () => {
		user.setAuthenticationFlowType('WRONG_AUTH_FLOW_TYPE');
		user.authenticateUser(authDetails, callback);
		expect(callback.onFailure.mock.calls.length).toBe(1);
	});
});

describe('Testing verify Software Token with a signed in user', () => {
	const minimalData = { UserPoolId: userPoolId, ClientId: clientId };
	const cognitoUserPool = new CognitoUserPool(minimalData);
	const cognitoUser = new CognitoUser({
		Username: 'username',
		Pool: cognitoUserPool,
	});

	afterAll(() => {
		jest.restoreAllMocks();
	});
	test('Verify Software Token Happy case', () => { 
		jest
			.spyOn(Client.prototype, 'request')
			.mockImplementationOnce((...args) => {
				args[2](null, {});
			});
		jest
			.spyOn(Client.prototype, 'request')
			.mockImplementationOnce((...args) => {
				args[2](null, {});
			});

		const callback = {
			onSuccess:jest.fn()	
		}

		cognitoUser.verifySoftwareToken(totpCode, deviceName, callback);
		expect(callback.onSuccess.mock.calls.length).toBe(1)
	});
	
	test('Verify software token first callback fails', () => { 
		jest
			.spyOn(Client.prototype, 'request')
			.mockImplementationOnce((...args) => {
				args[2](new Error('Network Error'), null);
			});
			
		const callback = {
			onFailure:jest.fn()
		}

		cognitoUser.verifySoftwareToken(totpCode, deviceName, callback);
		expect(callback.onFailure.mock.calls.length).toBe(1)
	});
	test('Verify Software Token second callback fails', () => { 
		jest
			.spyOn(Client.prototype, 'request')
			.mockImplementationOnce((...args) => {
				args[2](null, {});
			});
		jest
			.spyOn(Client.prototype, 'request')
			.mockImplementationOnce((...args) => {
				
				args[2](new Error('Request Access Error'), null);
			});
			
		const callback = {
			onFailure:jest.fn()
		}

		cognitoUser.verifySoftwareToken(totpCode, deviceName, callback);
		expect(callback.onFailure.mock.calls.length).toBe(1)
	});

	describe('Verify Software Token with an invalid signin user session', () => {
		const minimalData = { UserPoolId: userPoolId, ClientId: clientId };
		const cognitoUserPool = new CognitoUserPool(minimalData);
		const cognitoUser = new CognitoUser({
			Username: 'username',
			Pool: cognitoUserPool,
		});

		test('Happy case for non-signed in user session', () => {
			jest
			.spyOn(Client.prototype, 'request')
			.mockImplementationOnce((...args) => {
				args[2](null, {});
			});
			const callback = {
				onSuccess: jest.fn()
			}

			cognitoUser.setSignInUserSession(vCognitoUserSession)
			cognitoUser.verifySoftwareToken(totpCode, deviceName, callback);
			expect(callback.onSuccess.mock.calls.length).toBe(1);			
		});

		test('Error case for non-signed in user session', () => {
			jest
			.spyOn(Client.prototype, 'request')
			.mockImplementationOnce((...args) => {
				args[2](new Error('Client Error'),null);
			});
			const callback = {
				onFailure: jest.fn()
			}
			
			cognitoUser.setSignInUserSession(vCognitoUserSession)
			cognitoUser.verifySoftwareToken(totpCode, deviceName, callback);
			expect(callback.onFailure.mock.calls.length).toBe(1);		
		});
	});

	describe('Testing Associate Software Token', () => {
		const minimalData = { UserPoolId: userPoolId, ClientId: clientId };
		const cognitoUserPool = new CognitoUserPool(minimalData);
		const cognitoUser = new CognitoUser({
			Username: 'username',
			Pool: cognitoUserPool,
		});

		const callback = {
			associateSecretCode: jest.fn(),
			onFailure: jest.fn()
		}

		afterAll(() => {
			jest.restoreAllMocks();
		});
	
		afterEach(() => {
			callback.associateSecretCode.mockClear();
			callback.onFailure.mockClear();
		});

		test('Happy path for associate software token without a userSession ', () => {
			
			jest
			.spyOn(Client.prototype, 'request')
			.mockImplementationOnce((...args) => {
				args[2](null, {});
			});

			cognitoUser.associateSoftwareToken(callback)
			expect(callback.associateSecretCode.mock.calls.length).toBe(1);
		});

		test('Failing in the first requeset to client', () => {
			
			jest
			.spyOn(Client.prototype, 'request')
			.mockImplementationOnce((...args) => {
				args[2](new Error('Network Error'), null);
			});

			cognitoUser.associateSoftwareToken(callback)
			expect(callback.onFailure.mock.calls.length).toBe(1);
		});
		test('Happy path for a user with a validUserSession ', () => {
			
			jest
			.spyOn(Client.prototype, 'request')
			.mockImplementationOnce((...args) => {
				args[2](null, {});
			});

			cognitoUser.setSignInUserSession(vCognitoUserSession)
			cognitoUser.associateSoftwareToken(callback)

			expect(callback.associateSecretCode.mock.calls.length).toBe(1);
		});
		test('Error path for a user with a validUserSession ', () => {
			
			jest
			.spyOn(Client.prototype, 'request')
			.mockImplementationOnce((...args) => {
				args[2](new Error('Network Error'), null);
			});

			cognitoUser.setSignInUserSession(vCognitoUserSession)
			cognitoUser.associateSoftwareToken(callback)

			expect(callback.onFailure.mock.calls.length).toBe(1);
		});
		
	});

	describe('sendMFASelectionAnswer()', () => {
		const minimalData = { UserPoolId: userPoolId, ClientId: clientId };
		const cognitoUserPool = new CognitoUserPool(minimalData);
		const cognitoUser = new CognitoUser({
			Username: 'username',
			Pool: cognitoUserPool,
		});

		const callback = {
			mfaRequired: jest.fn(),
			onFailure: jest.fn(),
			totpRequired: jest.fn()
		}

		afterAll(() => {
			jest.restoreAllMocks();
		});
	
		test('happy case with SMS_MFA', () => {
			jest
			.spyOn(Client.prototype, 'request')
			.mockImplementationOnce((...args) => {
				args[2](null, {Session: 'sessionData'});
			});
			cognitoUser.sendMFASelectionAnswer('SMS_MFA',callback)
			expect(callback.mfaRequired.mock.calls.length).toEqual(1)
		});

		test('happy case with software token MFA', () => {
			jest
			.spyOn(Client.prototype, 'request')
			.mockImplementationOnce((...args) => {
				args[2](null, {Session: 'sessionData'});
			});
			cognitoUser.sendMFASelectionAnswer('SOFTWARE_TOKEN_MFA',callback)
			expect(callback.totpRequired.mock.calls.length).toEqual(1)
		});

		test('error case with software token MFA', () => {
			jest
			.spyOn(Client.prototype, 'request')
			.mockImplementationOnce((...args) => {
				args[2](new Error('Network Error'), null);
			});
			cognitoUser.sendMFASelectionAnswer('SOFTWARE_TOKEN_MFA',callback)
			expect(callback.onFailure.mock.calls.length).toEqual(1)
		});
		test('error case with undefined answer challenge', () => {
			jest
			.spyOn(Client.prototype, 'request')
			.mockImplementationOnce((...args) => {
				args[2](null, {Session:'sessionData'});
			});
			const res = cognitoUser.sendMFASelectionAnswer('WRONG_CHALLENGE',callback)
			expect(res).toEqual(undefined)
			
		});
	});

	describe('Signout and globalSignOut', () => {
		const minimalData = { UserPoolId: userPoolId, ClientId: clientId };
		const cognitoUserPool = new CognitoUserPool(minimalData);
		const cognitoUser = new CognitoUser({
			Username: 'username',
			Pool: cognitoUserPool,
		});

		const callback = {
			onSuccess: jest.fn(),
			onFailure: jest.fn(),
		}
		afterAll(() => {
			jest.restoreAllMocks();
		});

		afterEach(() => {
			callback.onSuccess.mockClear();
			callback.onFailure.mockClear();
		});
	
		test('signOut expected behavior', () => {
			cognitoUser.signOut()
			expect(cognitoUser.signInUserSession).toEqual(null)
		});

		test('global signOut Happy Path', () => {
			jest
			.spyOn(Client.prototype, 'request')
			.mockImplementationOnce((...args) => {
				args[2]();
			});
			cognitoUser.setSignInUserSession(vCognitoUserSession)
			cognitoUser.globalSignOut(callback)
			expect(callback.onSuccess.mock.calls.length).toEqual(1)
		});

		test('global signOut catching a error', () => {
			jest
			.spyOn(Client.prototype, 'request')
			.mockImplementationOnce((...args) => {
				args[2](err => { console.log(err)});
			});
			cognitoUser.setSignInUserSession(vCognitoUserSession)
			cognitoUser.globalSignOut(callback)
			expect(callback.onFailure.mock.calls.length).toEqual(1)
		});

		test('Global signout when user session is null', () => {
			cognitoUser.signInUserSession = null
			cognitoUser.globalSignOut(callback)
			expect(callback.onFailure.mock.calls.length).toEqual(1)
		});

		test('client request does not have a callback', () => {
			jest
			.spyOn(Client.prototype, 'request')
			.mockImplementationOnce((...args) => {
				args[2]();
			});
			cognitoUser.setSignInUserSession(vCognitoUserSession)
			expect(cognitoUser.globalSignOut(callback)).toEqual(undefined)
		});

	});
})


// Progress Report:
// All files      -    60.67 |    42.43 |    61.11 |    59.29
// CognitoUser.js -    25.37 |       10 |    15.52 |     22.8