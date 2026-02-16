import OAS from "../json/openapi.json";

import {
  IWebServiceEndpoint,
  IPluginWebService,
  ICactusPlugin,
  ICactusPluginOptions,
} from "@hyperledger/cactus-core-api";
import type { Express } from "express";

import { PluginRegistry } from "@hyperledger/cactus-core";

import {
  Checks,
  Logger,
  LoggerProvider,
  LogLevelDesc,
} from "@hyperledger/cactus-common";

import { CreateDppEndpoint } from "./web-services/create-dpp-endpoint";
import { TransferDppEndpoint } from "./web-services/transfer-dpp-endpoint";
import { AggregateDppEndpoint } from "./web-services/aggregate-dpp-endpoint";
import { UpdateTransportEndpoint } from "./web-services/update-transport-endpoint";
import { GetDppByIdEndpoint } from "./web-services/get-dpp-by-id-endpoint";
import { GetDppHistoryEndpoint } from "./web-services/get-dpp-history-endpoint";
import { AddFeedbackEndpoint } from "./web-services/add-feedback-endpoint";
import {
  TransportDataRequest,
  TransferRequest,
} from "./generated/openapi/typescript-axios";

export interface IPluginDppOptions extends ICactusPluginOptions {
  instanceId: string;
  pluginRegistry: PluginRegistry;
  logLevel?: LogLevelDesc;
}

export class PluginDpp implements ICactusPlugin, IPluginWebService {
  private readonly instanceId: string;
  private readonly log: Logger;
  private endpoints: IWebServiceEndpoint[] | undefined;
  public static readonly CLASS_NAME = "PluginDpp";

  public get className(): string {
    return PluginDpp.CLASS_NAME;
  }

  constructor(public readonly options: IPluginDppOptions) {
    const fnTag = `${this.className}#constructor()`;
    Checks.truthy(options, `${fnTag} arg options`);
    Checks.truthy(options.instanceId, `${fnTag} options.instanceId`);
    Checks.truthy(options.pluginRegistry, `${fnTag} options.pluginRegistry`);

    this.instanceId = options.instanceId;

    const level = this.options.logLevel || "INFO";
    const label = this.className;
    this.log = LoggerProvider.getOrCreate({ level, label });
  }

  public getOpenApiSpec(): unknown {
    return OAS;
  }

  public getInstanceId(): string {
    return this.instanceId;
  }

  public async shutdown(): Promise<void> {
    this.log.info(`Shutting down ${this.className}...`);
  }

  public async onPluginInit(): Promise<unknown> {
    return;
  }

  async registerWebServices(app: Express): Promise<IWebServiceEndpoint[]> {
    const webServices = await this.getOrCreateWebServices();
    await Promise.all(webServices.map((ws) => ws.registerExpress(app)));
    return webServices;
  }

  public async getOrCreateWebServices(): Promise<IWebServiceEndpoint[]> {
    if (Array.isArray(this.endpoints)) {
      return this.endpoints;
    }
    const endpoints: IWebServiceEndpoint[] = [];
    {
      const logLevel = this.options.logLevel;
      endpoints.push(new CreateDppEndpoint({ connector: this, logLevel }));
      endpoints.push(new TransferDppEndpoint({ connector: this, logLevel }));
      endpoints.push(new AggregateDppEndpoint({ connector: this, logLevel }));
      endpoints.push(
        new UpdateTransportEndpoint({ connector: this, logLevel }),
      );
      endpoints.push(new GetDppByIdEndpoint({ connector: this, logLevel }));
      endpoints.push(new GetDppHistoryEndpoint({ connector: this, logLevel }));
      endpoints.push(new AddFeedbackEndpoint({ connector: this, logLevel }));
    }
    this.endpoints = endpoints;
    return endpoints;
  }

  public async updateTransport(req: TransportDataRequest): Promise<void> {
    const fnTag = `${this.className}#updateTransport()`;
    this.log.debug(`${fnTag}`, req);
    // TODO: Implement business logic here
  }

  public async transfer(req: TransferRequest): Promise<void> {
    const fnTag = `${this.className}#transfer()`;
    this.log.debug(`${fnTag}`, req);
    // TODO: Implement business logic here
  }

  public getPackageName(): string {
    return `@hyperledger/cactus-plugin-dpp`;
  }
}
