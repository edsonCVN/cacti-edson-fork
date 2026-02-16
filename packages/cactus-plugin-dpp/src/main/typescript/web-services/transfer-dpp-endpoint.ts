import { Express, Request, Response } from "express";
import {
  IWebServiceEndpoint,
  IExpressRequestHandler,
  IEndpointAuthzOptions,
} from "@hyperledger/cactus-core-api";
import {
  Logger,
  Checks,
  LogLevelDesc,
  LoggerProvider,
  IAsyncProvider,
} from "@hyperledger/cactus-common";
import { registerWebServiceEndpoint } from "@hyperledger/cactus-core";
import { PluginDpp } from "../plugin-dpp";
import { TransferRequest } from "../generated/openapi/typescript-axios";

export interface ITransferDppEndpointOptions {
  logLevel?: LogLevelDesc;
  connector: PluginDpp;
}

export class TransferDppEndpoint implements IWebServiceEndpoint {
  public static readonly CLASS_NAME = "TransferDppEndpoint";

  private readonly log: Logger;

  public get className(): string {
    return TransferDppEndpoint.CLASS_NAME;
  }

  constructor(public readonly options: ITransferDppEndpointOptions) {
    const fnTag = `${this.className}#constructor()`;
    Checks.truthy(options, `${fnTag} arg options`);
    Checks.truthy(options.connector, `${fnTag} options.connector`);

    const level = this.options.logLevel || "INFO";
    const label = this.className;
    this.log = LoggerProvider.getOrCreate({ level, label });
  }

  public getAuthorizationOptionsProvider(): IAsyncProvider<IEndpointAuthzOptions> {
    return {
      get: async () => ({
        isProtected: true,
        requiredRoles: [],
      }),
    };
  }

  public async registerExpress(
    expressApp: Express,
  ): Promise<IWebServiceEndpoint> {
    await registerWebServiceEndpoint(expressApp, this);
    return this;
  }

  public getVerbLowerCase(): string {
    return "post";
  }

  public getPath(): string {
    return "/api/v1/@hyperledger/cactus-plugin-dpp/transfer";
  }

  public getExpressRequestHandler(): IExpressRequestHandler {
    return this.handleRequest.bind(this);
  }

  public async handleRequest(req: Request, res: Response): Promise<void> {
    const fnTag = `${this.className}#handleRequest()`;
    this.log.debug(`${fnTag}`);

    try {
      const requestBody = req.body as TransferRequest;
      await this.options.connector.transfer(requestBody);
      res.status(200).json({ description: "Ownership Transferred" });
    } catch (ex) {
      this.log.error(`${fnTag} failed to serve request`, ex);
      res.status(500).json({
        message: "Internal Server Error",
        error: ex instanceof Error ? ex.message : "Unknown Error",
      });
    }
  }
}
