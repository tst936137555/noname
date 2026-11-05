export interface ServerOptions {
	port?: number;
	host?: string;
	credentialDirectory?: string;
}

export interface ServerInstance {
	start(): Promise<void>;
	stop(): Promise<void>;
}
