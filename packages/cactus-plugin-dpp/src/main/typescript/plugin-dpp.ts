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

export interface IPluginDppOptions extends ICactusPluginOptions {
  instanceId: string;
  pluginRegistry: PluginRegistry;
  logLevel?: LogLevelDesc;
}

/**
 * Hyperledger Cacti plugin for Digital Product Passport (DPP) management.
 *
 * The functional REST API is implemented in `scripts/launch-api.ts`, which
 * builds an Express server backed by {@link EVMDPPLeaf}.  This plugin class
 * provides the Cacti lifecycle hooks (init, shutdown, OpenAPI spec) so that
 * the DPP module integrates with the Cacti API server and plugin registry.
 */
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
    // Endpoint registration is handled by the Express server in
    // scripts/launch-api.ts, which wires routes directly to EVMDPPLeaf.
    this.endpoints = [];
    return this.endpoints;
  }

  public getPackageName(): string {
    return `@hyperledger/cactus-plugin-dpp`;
  }
}

// Alias for code that imports PluginDPP (uppercase)
export { PluginDpp as PluginDPP };
