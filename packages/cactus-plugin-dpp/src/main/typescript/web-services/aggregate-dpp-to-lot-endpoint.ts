import { Express, Request, Response } from "express";

import {
  Logger,
  Checks,
  LogLevelDesc,
  LoggerProvider,
  IAsyncProvider,
  safeStringifyException,
} from "@hyperledger/cactus-common";
import {
  IEndpointAuthzOptions,
  IExpressRequestHandler,
  IWebServiceEndpoint,
} from "@hyperledger/cactus-core-api";
import { registerWebServiceEndpoint } from "@hyperledger/cactus-core";

import { PluginDPP } from "../plugin-dpp";

import { AggregateDPPtoLotRequest } from "./../generated/openapi/typescript-axios";

import OAS from "../../json/openapi.json";

export interface IAggregateDPPtoLotEndpointOptions {
  logLevel?: LogLevelDesc;
  plugin: PluginDPP;
}

export class AggregateDPPtoLotEndpoint implements IWebServiceEndpoint {
  public static readonly CLASS_NAME = "AggregateDPPtoLotEndpoint";
  private readonly log: Logger;

  public get className(): string {
    return AggregateDPPtoLotEndpoint.CLASS_NAME;
  }

  constructor(public readonly options: IAggregateDPPtoLotEndpointOptions) {
    const fnTag = `${this.className}#constructor()`;
    Checks.truthy(options, `${fnTag} arg options`);
    Checks.truthy(options.plugin, `${fnTag} arg options.plugin`);

    const level = options.logLevel || "INFO";
    const label = this.className;
    this.log = LoggerProvider.getOrCreate({ level, label });
  }

  public get oasPath(): (typeof OAS.paths)["/api/v1/@hyperledger/cactus-plugin-dpp/aggregate-dpp-to-lot"] {
    return OAS.paths[
      "/api/v1/@hyperledger/cactus-plugin-dpp/aggregate-dpp-to-lot"
    ];
  }

  public getPath(): string {
    return this.oasPath.post["x-hyperledger-cacti"].http.path;
  }

  public getVerbLowerCase(): string {
    return this.oasPath.post["x-hyperledger-cacti"].http.verbLowerCase;
  }

  public getOperationId(): string {
    return this.oasPath.post.operationId;
  }

  getAuthorizationOptionsProvider(): IAsyncProvider<IEndpointAuthzOptions> {
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

  public getExpressRequestHandler(): IExpressRequestHandler {
    return this.handleRequest.bind(this);
  }

  private async handleRequest(req: Request, res: Response): Promise<void> {
    const reqTag = `${this.getVerbLowerCase()} - ${this.getPath()}`;
    this.log.debug(reqTag);

    const reqBody = req.body as AggregateDPPtoLotRequest;

    try {
      const resp = await this.options.plugin.aggregateDPPtoLot(reqBody);
      res.status(200).json(resp);
    } catch (ex) {
      this.log.error(`Crash while serving ${reqTag}`, ex);
      res.status(500).json({
        message: "Internal Server Error",
        error: safeStringifyException(ex),
      });
    }
  }
}
