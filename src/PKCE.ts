import sha256 from 'crypto-js/sha256';
import Base64 from 'crypto-js/enc-base64';
import WordArray from 'crypto-js/lib-typedarrays';
import IAuthResponse from './IAuthResponse';
import IConfig from './IConfig';
import ITokenResponse from './ITokenResponse';

export default class PKCE {
  private config: IConfig;
  private state: string = '';
  private codeVerifier: string = '';

  /**
   * Initialize the instance with configuration
   * @param {IConfig} config
   */
  constructor(config: IConfig) {
    this.config = config;
  }

  /**
   * Generate the authorize url
   * @param  {object} additionalParams include additional parameters in the query
   * @return Promise<string>
   */
  public authorizeUrl(additionalParams: object = {}): string {
    const codeChallenge = this.pkceChallengeFromVerifier();

    const queryString = new URLSearchParams(
      Object.assign(
        {
          response_type: 'code',
          client_id: this.config.client_id,
          state: this.getState(),
          scope: this.config.requested_scopes,
          redirect_uri: this.config.redirect_uri,
          code_challenge: codeChallenge,
          code_challenge_method: 'S256',
        },
        additionalParams,
      ),
    ).toString();

    return `${this.config.authorization_endpoint}?${queryString}`;
  }

  /**
   * Given the return url, get a token from the oauth server
   * @param  url current urlwith params from server
   * @param  {object} additionalParams include additional parameters in the request body
   * @return {Promise<ITokenResponse>}
   */
  public exchangeForAccessToken(url: string, additionalParams: object = {}): Promise<ITokenResponse> {
    return this.parseAuthResponseUrl(url).then((q) => {
      return fetch(this.config.token_endpoint, {
        method: 'POST',
        body: new URLSearchParams(
          Object.assign(
            {
              grant_type: 'authorization_code',
              code: q.code,
              client_id: this.config.client_id,
              redirect_uri: this.config.redirect_uri,
              code_verifier: this.getCodeVerifier(),
            },
            additionalParams,
          ),
        ),
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
        },
      }).then((response) => response.json());
    });
  }

  /**
   * Get the current codeVerifier or generate a new one
   * @return {string}
   */
  private getCodeVerifier(): string {
    if (this.codeVerifier === '') {
      this.codeVerifier = this.randomStringFromStorage('pkce_code_verifier');
    }

    return this.codeVerifier;
  }

  /**
   * Get the current state or generate a new one
   * @return {string}
   */
  private getState(): string {
    if (this.state === '') {
      this.state = this.randomStringFromStorage('pkce_state');
    }

    return this.state;
  }

  /**
   * Get the query params as json from a auth response url
   * @param  {string} url a url expected to have AuthResponse params
   * @return {Promise<IAuthResponse>}
   */
  private parseAuthResponseUrl(url: string): Promise<IAuthResponse> {
    const params = new URL(url).searchParams;

    return this.validateAuthResponse({
      error: params.get('error'),
      query: params.get('query'),
      state: params.get('state'),
      code: params.get('code'),
    });
  }

  /**
   * Generate a code challenge
   * @return {Promise<string>}
   */
  private pkceChallengeFromVerifier(): string {
    const hashed = sha256(this.getCodeVerifier());
    return Base64.stringify(hashed).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  /**
   * Get a random string from storage or store a new one and return it's value
   * @param  {string} key
   * @return {string}
   */
  private randomStringFromStorage(key: string): string {
    const fromStorage = sessionStorage.getItem(key);
    if (fromStorage === null) {
      sessionStorage.setItem(key, WordArray.random(64));
    }

    return sessionStorage.getItem(key) || '';
  }

  /**
   * Validates params from auth response
   * @param  {AuthResponse} queryParams
   * @return {Promise<IAuthResponse>}
   */
  private validateAuthResponse(queryParams: IAuthResponse): Promise<IAuthResponse> {
    return new Promise<IAuthResponse>((resolve, reject) => {
      if (queryParams.error) {
        return reject({ error: queryParams.error });
      }

      if (queryParams.state !== this.getState()) {
        return reject({ error: 'Invalid State' });
      }

      return resolve(queryParams);
    });
  }
}
