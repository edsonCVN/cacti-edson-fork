# DefaultApi

All URIs are relative to *http://localhost*

| Method | HTTP request | Description |
|------------- | ------------- | -------------|
| [**addCertification**](DefaultApi.md#addCertification) | **POST** /api/v1/@hyperledger/cactus-plugin-dpp/add-certification |  |
| [**aggregateDPPtoBox**](DefaultApi.md#aggregateDPPtoBox) | **POST** /api/v1/@hyperledger/cactus-plugin-dpp/aggregate-dpp-to-box |  |
| [**aggregateDPPtoLot**](DefaultApi.md#aggregateDPPtoLot) | **POST** /api/v1/@hyperledger/cactus-plugin-dpp/aggregate-dpp-to-lot |  |
| [**amendDPPData**](DefaultApi.md#amendDPPData) | **POST** /api/v1/@hyperledger/cactus-plugin-dpp/amend-dpp-data |  |
| [**checkCrossChainStatus**](DefaultApi.md#checkCrossChainStatus) | **POST** /api/v1/@hyperledger/cactus-plugin-dpp/check-crosschain-status |  |
| [**createDPP**](DefaultApi.md#createDPP) | **POST** /api/v1/@hyperledger/cactus-plugin-dpp/create-dpp |  |
| [**crossChainTransferDPP**](DefaultApi.md#crossChainTransferDPP) | **POST** /api/v1/@hyperledger/cactus-plugin-dpp/crosschain-transfer-dpp |  |
| [**getDPPComponents**](DefaultApi.md#getDPPComponents) | **POST** /api/v1/@hyperledger/cactus-plugin-dpp/get-dpp-components |  |
| [**getDPPData**](DefaultApi.md#getDPPData) | **POST** /api/v1/@hyperledger/cactus-plugin-dpp/get-dpp-data |  |
| [**getDPPHistory**](DefaultApi.md#getDPPHistory) | **POST** /api/v1/@hyperledger/cactus-plugin-dpp/get-dpp-history |  |
| [**getRecyclingInfo**](DefaultApi.md#getRecyclingInfo) | **POST** /api/v1/@hyperledger/cactus-plugin-dpp/get-recycling-info |  |
| [**listOwnedDPPs**](DefaultApi.md#listOwnedDPPs) | **POST** /api/v1/@hyperledger/cactus-plugin-dpp/list-owned-dpps |  |
| [**receiveDPP**](DefaultApi.md#receiveDPP) | **POST** /api/v1/@hyperledger/cactus-plugin-dpp/receive-dpp |  |
| [**revokeDPP**](DefaultApi.md#revokeDPP) | **POST** /api/v1/@hyperledger/cactus-plugin-dpp/revoke-dpp |  |
| [**searchDPPByCriteria**](DefaultApi.md#searchDPPByCriteria) | **POST** /api/v1/@hyperledger/cactus-plugin-dpp/search-dpp-by-criteria |  |
| [**submitProductReview**](DefaultApi.md#submitProductReview) | **POST** /api/v1/@hyperledger/cactus-plugin-dpp/submit-product-review |  |
| [**subscribeToUpdates**](DefaultApi.md#subscribeToUpdates) | **POST** /api/v1/@hyperledger/cactus-plugin-dpp/subscribe-to-updates |  |
| [**transferDPP**](DefaultApi.md#transferDPP) | **POST** /api/v1/@hyperledger/cactus-plugin-dpp/transfer-dpp |  |
| [**updateRetailData**](DefaultApi.md#updateRetailData) | **POST** /api/v1/@hyperledger/cactus-plugin-dpp/update-retail-data |  |
| [**updateTransportData**](DefaultApi.md#updateTransportData) | **POST** /api/v1/@hyperledger/cactus-plugin-dpp/update-transport-data |  |
| [**verifyDPPAuthenticity**](DefaultApi.md#verifyDPPAuthenticity) | **POST** /api/v1/@hyperledger/cactus-plugin-dpp/verify-dpp-authenticity |  |


<a id="addCertification"></a>
# **addCertification**
> GenericResponse addCertification(addCertificationRequest)



Adiciona uma nova certificacao ou atualiza uma existente.

### Example
```java
// Import classes:
import org.openapitools.client.ApiClient;
import org.openapitools.client.ApiException;
import org.openapitools.client.Configuration;
import org.openapitools.client.models.*;
import org.openapitools.client.api.DefaultApi;

public class Example {
  public static void main(String[] args) {
    ApiClient defaultClient = Configuration.getDefaultApiClient();
    defaultClient.setBasePath("http://localhost");

    DefaultApi apiInstance = new DefaultApi(defaultClient);
    AddCertificationRequest addCertificationRequest = new AddCertificationRequest(); // AddCertificationRequest | 
    try {
      GenericResponse result = apiInstance.addCertification(addCertificationRequest);
      System.out.println(result);
    } catch (ApiException e) {
      System.err.println("Exception when calling DefaultApi#addCertification");
      System.err.println("Status code: " + e.getCode());
      System.err.println("Reason: " + e.getResponseBody());
      System.err.println("Response headers: " + e.getResponseHeaders());
      e.printStackTrace();
    }
  }
}
```

### Parameters

| Name | Type | Description  | Notes |
|------------- | ------------- | ------------- | -------------|
| **addCertificationRequest** | [**AddCertificationRequest**](AddCertificationRequest.md)|  | [optional] |

### Return type

[**GenericResponse**](GenericResponse.md)

### Authorization

No authorization required

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/json

### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | Successful response |  -  |

<a id="aggregateDPPtoBox"></a>
# **aggregateDPPtoBox**
> AggregateDPPtoBoxResponse aggregateDPPtoBox(aggregateDPPtoBoxRequest)



Agrega múltiplos DPPs de produção num novo DPP de Caixa.

### Example
```java
// Import classes:
import org.openapitools.client.ApiClient;
import org.openapitools.client.ApiException;
import org.openapitools.client.Configuration;
import org.openapitools.client.models.*;
import org.openapitools.client.api.DefaultApi;

public class Example {
  public static void main(String[] args) {
    ApiClient defaultClient = Configuration.getDefaultApiClient();
    defaultClient.setBasePath("http://localhost");

    DefaultApi apiInstance = new DefaultApi(defaultClient);
    AggregateDPPtoBoxRequest aggregateDPPtoBoxRequest = new AggregateDPPtoBoxRequest(); // AggregateDPPtoBoxRequest | 
    try {
      AggregateDPPtoBoxResponse result = apiInstance.aggregateDPPtoBox(aggregateDPPtoBoxRequest);
      System.out.println(result);
    } catch (ApiException e) {
      System.err.println("Exception when calling DefaultApi#aggregateDPPtoBox");
      System.err.println("Status code: " + e.getCode());
      System.err.println("Reason: " + e.getResponseBody());
      System.err.println("Response headers: " + e.getResponseHeaders());
      e.printStackTrace();
    }
  }
}
```

### Parameters

| Name | Type | Description  | Notes |
|------------- | ------------- | ------------- | -------------|
| **aggregateDPPtoBoxRequest** | [**AggregateDPPtoBoxRequest**](AggregateDPPtoBoxRequest.md)|  | [optional] |

### Return type

[**AggregateDPPtoBoxResponse**](AggregateDPPtoBoxResponse.md)

### Authorization

No authorization required

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/json

### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | Successful response |  -  |

<a id="aggregateDPPtoLot"></a>
# **aggregateDPPtoLot**
> AggregateDPPtoLotResponse aggregateDPPtoLot(aggregateDPPtoLotRequest)



Agrega múltiplos DPPs de Caixa num novo DPP de Lote.

### Example
```java
// Import classes:
import org.openapitools.client.ApiClient;
import org.openapitools.client.ApiException;
import org.openapitools.client.Configuration;
import org.openapitools.client.models.*;
import org.openapitools.client.api.DefaultApi;

public class Example {
  public static void main(String[] args) {
    ApiClient defaultClient = Configuration.getDefaultApiClient();
    defaultClient.setBasePath("http://localhost");

    DefaultApi apiInstance = new DefaultApi(defaultClient);
    AggregateDPPtoLotRequest aggregateDPPtoLotRequest = new AggregateDPPtoLotRequest(); // AggregateDPPtoLotRequest | 
    try {
      AggregateDPPtoLotResponse result = apiInstance.aggregateDPPtoLot(aggregateDPPtoLotRequest);
      System.out.println(result);
    } catch (ApiException e) {
      System.err.println("Exception when calling DefaultApi#aggregateDPPtoLot");
      System.err.println("Status code: " + e.getCode());
      System.err.println("Reason: " + e.getResponseBody());
      System.err.println("Response headers: " + e.getResponseHeaders());
      e.printStackTrace();
    }
  }
}
```

### Parameters

| Name | Type | Description  | Notes |
|------------- | ------------- | ------------- | -------------|
| **aggregateDPPtoLotRequest** | [**AggregateDPPtoLotRequest**](AggregateDPPtoLotRequest.md)|  | [optional] |

### Return type

[**AggregateDPPtoLotResponse**](AggregateDPPtoLotResponse.md)

### Authorization

No authorization required

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/json

### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | Successful response |  -  |

<a id="amendDPPData"></a>
# **amendDPPData**
> GenericResponse amendDPPData(amendDPPDataRequest)



Permite correcao pontual de dados introduzidos.

### Example
```java
// Import classes:
import org.openapitools.client.ApiClient;
import org.openapitools.client.ApiException;
import org.openapitools.client.Configuration;
import org.openapitools.client.models.*;
import org.openapitools.client.api.DefaultApi;

public class Example {
  public static void main(String[] args) {
    ApiClient defaultClient = Configuration.getDefaultApiClient();
    defaultClient.setBasePath("http://localhost");

    DefaultApi apiInstance = new DefaultApi(defaultClient);
    AmendDPPDataRequest amendDPPDataRequest = new AmendDPPDataRequest(); // AmendDPPDataRequest | 
    try {
      GenericResponse result = apiInstance.amendDPPData(amendDPPDataRequest);
      System.out.println(result);
    } catch (ApiException e) {
      System.err.println("Exception when calling DefaultApi#amendDPPData");
      System.err.println("Status code: " + e.getCode());
      System.err.println("Reason: " + e.getResponseBody());
      System.err.println("Response headers: " + e.getResponseHeaders());
      e.printStackTrace();
    }
  }
}
```

### Parameters

| Name | Type | Description  | Notes |
|------------- | ------------- | ------------- | -------------|
| **amendDPPDataRequest** | [**AmendDPPDataRequest**](AmendDPPDataRequest.md)|  | [optional] |

### Return type

[**GenericResponse**](GenericResponse.md)

### Authorization

No authorization required

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/json

### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | Successful response |  -  |

<a id="checkCrossChainStatus"></a>
# **checkCrossChainStatus**
> GenericResponse checkCrossChainStatus(checkCrossChainStatusRequest)



Verifica o estado de uma transferencia entre blockchains.

### Example
```java
// Import classes:
import org.openapitools.client.ApiClient;
import org.openapitools.client.ApiException;
import org.openapitools.client.Configuration;
import org.openapitools.client.models.*;
import org.openapitools.client.api.DefaultApi;

public class Example {
  public static void main(String[] args) {
    ApiClient defaultClient = Configuration.getDefaultApiClient();
    defaultClient.setBasePath("http://localhost");

    DefaultApi apiInstance = new DefaultApi(defaultClient);
    CheckCrossChainStatusRequest checkCrossChainStatusRequest = new CheckCrossChainStatusRequest(); // CheckCrossChainStatusRequest | 
    try {
      GenericResponse result = apiInstance.checkCrossChainStatus(checkCrossChainStatusRequest);
      System.out.println(result);
    } catch (ApiException e) {
      System.err.println("Exception when calling DefaultApi#checkCrossChainStatus");
      System.err.println("Status code: " + e.getCode());
      System.err.println("Reason: " + e.getResponseBody());
      System.err.println("Response headers: " + e.getResponseHeaders());
      e.printStackTrace();
    }
  }
}
```

### Parameters

| Name | Type | Description  | Notes |
|------------- | ------------- | ------------- | -------------|
| **checkCrossChainStatusRequest** | [**CheckCrossChainStatusRequest**](CheckCrossChainStatusRequest.md)|  | [optional] |

### Return type

[**GenericResponse**](GenericResponse.md)

### Authorization

No authorization required

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/json

### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | Successful response |  -  |

<a id="createDPP"></a>
# **createDPP**
> CreateDPPResponse createDPP(createDPPRequest)



Cria o DPP (NFT) inicial para um lote de producao.

### Example
```java
// Import classes:
import org.openapitools.client.ApiClient;
import org.openapitools.client.ApiException;
import org.openapitools.client.Configuration;
import org.openapitools.client.models.*;
import org.openapitools.client.api.DefaultApi;

public class Example {
  public static void main(String[] args) {
    ApiClient defaultClient = Configuration.getDefaultApiClient();
    defaultClient.setBasePath("http://localhost");

    DefaultApi apiInstance = new DefaultApi(defaultClient);
    CreateDPPRequest createDPPRequest = new CreateDPPRequest(); // CreateDPPRequest | 
    try {
      CreateDPPResponse result = apiInstance.createDPP(createDPPRequest);
      System.out.println(result);
    } catch (ApiException e) {
      System.err.println("Exception when calling DefaultApi#createDPP");
      System.err.println("Status code: " + e.getCode());
      System.err.println("Reason: " + e.getResponseBody());
      System.err.println("Response headers: " + e.getResponseHeaders());
      e.printStackTrace();
    }
  }
}
```

### Parameters

| Name | Type | Description  | Notes |
|------------- | ------------- | ------------- | -------------|
| **createDPPRequest** | [**CreateDPPRequest**](CreateDPPRequest.md)|  | [optional] |

### Return type

[**CreateDPPResponse**](CreateDPPResponse.md)

### Authorization

No authorization required

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/json

### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | Successful response |  -  |

<a id="crossChainTransferDPP"></a>
# **crossChainTransferDPP**
> GenericResponse crossChainTransferDPP(crossChainTransferDPPRequest)



Move ou sincroniza o DPP entre blockchains.

### Example
```java
// Import classes:
import org.openapitools.client.ApiClient;
import org.openapitools.client.ApiException;
import org.openapitools.client.Configuration;
import org.openapitools.client.models.*;
import org.openapitools.client.api.DefaultApi;

public class Example {
  public static void main(String[] args) {
    ApiClient defaultClient = Configuration.getDefaultApiClient();
    defaultClient.setBasePath("http://localhost");

    DefaultApi apiInstance = new DefaultApi(defaultClient);
    CrossChainTransferDPPRequest crossChainTransferDPPRequest = new CrossChainTransferDPPRequest(); // CrossChainTransferDPPRequest | 
    try {
      GenericResponse result = apiInstance.crossChainTransferDPP(crossChainTransferDPPRequest);
      System.out.println(result);
    } catch (ApiException e) {
      System.err.println("Exception when calling DefaultApi#crossChainTransferDPP");
      System.err.println("Status code: " + e.getCode());
      System.err.println("Reason: " + e.getResponseBody());
      System.err.println("Response headers: " + e.getResponseHeaders());
      e.printStackTrace();
    }
  }
}
```

### Parameters

| Name | Type | Description  | Notes |
|------------- | ------------- | ------------- | -------------|
| **crossChainTransferDPPRequest** | [**CrossChainTransferDPPRequest**](CrossChainTransferDPPRequest.md)|  | [optional] |

### Return type

[**GenericResponse**](GenericResponse.md)

### Authorization

No authorization required

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/json

### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | Successful response |  -  |

<a id="getDPPComponents"></a>
# **getDPPComponents**
> GetDPPComponentsResponse getDPPComponents(getDPPComponentsRequest)



Lista os identificadores dos DPPs filhos associados.

### Example
```java
// Import classes:
import org.openapitools.client.ApiClient;
import org.openapitools.client.ApiException;
import org.openapitools.client.Configuration;
import org.openapitools.client.models.*;
import org.openapitools.client.api.DefaultApi;

public class Example {
  public static void main(String[] args) {
    ApiClient defaultClient = Configuration.getDefaultApiClient();
    defaultClient.setBasePath("http://localhost");

    DefaultApi apiInstance = new DefaultApi(defaultClient);
    GetDPPComponentsRequest getDPPComponentsRequest = new GetDPPComponentsRequest(); // GetDPPComponentsRequest | 
    try {
      GetDPPComponentsResponse result = apiInstance.getDPPComponents(getDPPComponentsRequest);
      System.out.println(result);
    } catch (ApiException e) {
      System.err.println("Exception when calling DefaultApi#getDPPComponents");
      System.err.println("Status code: " + e.getCode());
      System.err.println("Reason: " + e.getResponseBody());
      System.err.println("Response headers: " + e.getResponseHeaders());
      e.printStackTrace();
    }
  }
}
```

### Parameters

| Name | Type | Description  | Notes |
|------------- | ------------- | ------------- | -------------|
| **getDPPComponentsRequest** | [**GetDPPComponentsRequest**](GetDPPComponentsRequest.md)|  | [optional] |

### Return type

[**GetDPPComponentsResponse**](GetDPPComponentsResponse.md)

### Authorization

No authorization required

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/json

### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | Successful response |  -  |

<a id="getDPPData"></a>
# **getDPPData**
> GetDPPDataResponse getDPPData(getDPPDataRequest)



Acede a todas as informacoes relevantes do DPP.

### Example
```java
// Import classes:
import org.openapitools.client.ApiClient;
import org.openapitools.client.ApiException;
import org.openapitools.client.Configuration;
import org.openapitools.client.models.*;
import org.openapitools.client.api.DefaultApi;

public class Example {
  public static void main(String[] args) {
    ApiClient defaultClient = Configuration.getDefaultApiClient();
    defaultClient.setBasePath("http://localhost");

    DefaultApi apiInstance = new DefaultApi(defaultClient);
    GetDPPDataRequest getDPPDataRequest = new GetDPPDataRequest(); // GetDPPDataRequest | 
    try {
      GetDPPDataResponse result = apiInstance.getDPPData(getDPPDataRequest);
      System.out.println(result);
    } catch (ApiException e) {
      System.err.println("Exception when calling DefaultApi#getDPPData");
      System.err.println("Status code: " + e.getCode());
      System.err.println("Reason: " + e.getResponseBody());
      System.err.println("Response headers: " + e.getResponseHeaders());
      e.printStackTrace();
    }
  }
}
```

### Parameters

| Name | Type | Description  | Notes |
|------------- | ------------- | ------------- | -------------|
| **getDPPDataRequest** | [**GetDPPDataRequest**](GetDPPDataRequest.md)|  | [optional] |

### Return type

[**GetDPPDataResponse**](GetDPPDataResponse.md)

### Authorization

No authorization required

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/json

### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | Successful response |  -  |

<a id="getDPPHistory"></a>
# **getDPPHistory**
> GetDPPHistoryResponse getDPPHistory(getDPPHistoryRequest)



Obtem o historico completo do DPP.

### Example
```java
// Import classes:
import org.openapitools.client.ApiClient;
import org.openapitools.client.ApiException;
import org.openapitools.client.Configuration;
import org.openapitools.client.models.*;
import org.openapitools.client.api.DefaultApi;

public class Example {
  public static void main(String[] args) {
    ApiClient defaultClient = Configuration.getDefaultApiClient();
    defaultClient.setBasePath("http://localhost");

    DefaultApi apiInstance = new DefaultApi(defaultClient);
    GetDPPHistoryRequest getDPPHistoryRequest = new GetDPPHistoryRequest(); // GetDPPHistoryRequest | 
    try {
      GetDPPHistoryResponse result = apiInstance.getDPPHistory(getDPPHistoryRequest);
      System.out.println(result);
    } catch (ApiException e) {
      System.err.println("Exception when calling DefaultApi#getDPPHistory");
      System.err.println("Status code: " + e.getCode());
      System.err.println("Reason: " + e.getResponseBody());
      System.err.println("Response headers: " + e.getResponseHeaders());
      e.printStackTrace();
    }
  }
}
```

### Parameters

| Name | Type | Description  | Notes |
|------------- | ------------- | ------------- | -------------|
| **getDPPHistoryRequest** | [**GetDPPHistoryRequest**](GetDPPHistoryRequest.md)|  | [optional] |

### Return type

[**GetDPPHistoryResponse**](GetDPPHistoryResponse.md)

### Authorization

No authorization required

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/json

### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | Successful response |  -  |

<a id="getRecyclingInfo"></a>
# **getRecyclingInfo**
> GetRecyclingInfoResponse getRecyclingInfo(getRecyclingInfoRequest)



Fornece informacoes sobre reciclagem do DPP.

### Example
```java
// Import classes:
import org.openapitools.client.ApiClient;
import org.openapitools.client.ApiException;
import org.openapitools.client.Configuration;
import org.openapitools.client.models.*;
import org.openapitools.client.api.DefaultApi;

public class Example {
  public static void main(String[] args) {
    ApiClient defaultClient = Configuration.getDefaultApiClient();
    defaultClient.setBasePath("http://localhost");

    DefaultApi apiInstance = new DefaultApi(defaultClient);
    GetRecyclingInfoRequest getRecyclingInfoRequest = new GetRecyclingInfoRequest(); // GetRecyclingInfoRequest | 
    try {
      GetRecyclingInfoResponse result = apiInstance.getRecyclingInfo(getRecyclingInfoRequest);
      System.out.println(result);
    } catch (ApiException e) {
      System.err.println("Exception when calling DefaultApi#getRecyclingInfo");
      System.err.println("Status code: " + e.getCode());
      System.err.println("Reason: " + e.getResponseBody());
      System.err.println("Response headers: " + e.getResponseHeaders());
      e.printStackTrace();
    }
  }
}
```

### Parameters

| Name | Type | Description  | Notes |
|------------- | ------------- | ------------- | -------------|
| **getRecyclingInfoRequest** | [**GetRecyclingInfoRequest**](GetRecyclingInfoRequest.md)|  | [optional] |

### Return type

[**GetRecyclingInfoResponse**](GetRecyclingInfoResponse.md)

### Authorization

No authorization required

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/json

### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | Successful response |  -  |

<a id="listOwnedDPPs"></a>
# **listOwnedDPPs**
> ListOwnedDPPsResponse listOwnedDPPs(listOwnedDPPsRequest)



Lista todos os DPPs atualmente detidos pelo ator.

### Example
```java
// Import classes:
import org.openapitools.client.ApiClient;
import org.openapitools.client.ApiException;
import org.openapitools.client.Configuration;
import org.openapitools.client.models.*;
import org.openapitools.client.api.DefaultApi;

public class Example {
  public static void main(String[] args) {
    ApiClient defaultClient = Configuration.getDefaultApiClient();
    defaultClient.setBasePath("http://localhost");

    DefaultApi apiInstance = new DefaultApi(defaultClient);
    ListOwnedDPPsRequest listOwnedDPPsRequest = new ListOwnedDPPsRequest(); // ListOwnedDPPsRequest | 
    try {
      ListOwnedDPPsResponse result = apiInstance.listOwnedDPPs(listOwnedDPPsRequest);
      System.out.println(result);
    } catch (ApiException e) {
      System.err.println("Exception when calling DefaultApi#listOwnedDPPs");
      System.err.println("Status code: " + e.getCode());
      System.err.println("Reason: " + e.getResponseBody());
      System.err.println("Response headers: " + e.getResponseHeaders());
      e.printStackTrace();
    }
  }
}
```

### Parameters

| Name | Type | Description  | Notes |
|------------- | ------------- | ------------- | -------------|
| **listOwnedDPPsRequest** | [**ListOwnedDPPsRequest**](ListOwnedDPPsRequest.md)|  | [optional] |

### Return type

[**ListOwnedDPPsResponse**](ListOwnedDPPsResponse.md)

### Authorization

No authorization required

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/json

### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | Successful response |  -  |

<a id="receiveDPP"></a>
# **receiveDPP**
> GenericResponse receiveDPP(receiveDPPRequest)



Recebe a notificacao de transferencia e assume a propriedade do DPP.

### Example
```java
// Import classes:
import org.openapitools.client.ApiClient;
import org.openapitools.client.ApiException;
import org.openapitools.client.Configuration;
import org.openapitools.client.models.*;
import org.openapitools.client.api.DefaultApi;

public class Example {
  public static void main(String[] args) {
    ApiClient defaultClient = Configuration.getDefaultApiClient();
    defaultClient.setBasePath("http://localhost");

    DefaultApi apiInstance = new DefaultApi(defaultClient);
    ReceiveDPPRequest receiveDPPRequest = new ReceiveDPPRequest(); // ReceiveDPPRequest | 
    try {
      GenericResponse result = apiInstance.receiveDPP(receiveDPPRequest);
      System.out.println(result);
    } catch (ApiException e) {
      System.err.println("Exception when calling DefaultApi#receiveDPP");
      System.err.println("Status code: " + e.getCode());
      System.err.println("Reason: " + e.getResponseBody());
      System.err.println("Response headers: " + e.getResponseHeaders());
      e.printStackTrace();
    }
  }
}
```

### Parameters

| Name | Type | Description  | Notes |
|------------- | ------------- | ------------- | -------------|
| **receiveDPPRequest** | [**ReceiveDPPRequest**](ReceiveDPPRequest.md)|  | [optional] |

### Return type

[**GenericResponse**](GenericResponse.md)

### Authorization

No authorization required

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/json

### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | Successful response |  -  |

<a id="revokeDPP"></a>
# **revokeDPP**
> GenericResponse revokeDPP(revokeDPPRequest)



Marca o DPP como invalido ou revogado.

### Example
```java
// Import classes:
import org.openapitools.client.ApiClient;
import org.openapitools.client.ApiException;
import org.openapitools.client.Configuration;
import org.openapitools.client.models.*;
import org.openapitools.client.api.DefaultApi;

public class Example {
  public static void main(String[] args) {
    ApiClient defaultClient = Configuration.getDefaultApiClient();
    defaultClient.setBasePath("http://localhost");

    DefaultApi apiInstance = new DefaultApi(defaultClient);
    RevokeDPPRequest revokeDPPRequest = new RevokeDPPRequest(); // RevokeDPPRequest | 
    try {
      GenericResponse result = apiInstance.revokeDPP(revokeDPPRequest);
      System.out.println(result);
    } catch (ApiException e) {
      System.err.println("Exception when calling DefaultApi#revokeDPP");
      System.err.println("Status code: " + e.getCode());
      System.err.println("Reason: " + e.getResponseBody());
      System.err.println("Response headers: " + e.getResponseHeaders());
      e.printStackTrace();
    }
  }
}
```

### Parameters

| Name | Type | Description  | Notes |
|------------- | ------------- | ------------- | -------------|
| **revokeDPPRequest** | [**RevokeDPPRequest**](RevokeDPPRequest.md)|  | [optional] |

### Return type

[**GenericResponse**](GenericResponse.md)

### Authorization

No authorization required

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/json

### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | Successful response |  -  |

<a id="searchDPPByCriteria"></a>
# **searchDPPByCriteria**
> SearchDPPByCriteriaResponse searchDPPByCriteria(searchDPPByCriteriaRequest)



Permite pesquisar DPPs com base em criterios.

### Example
```java
// Import classes:
import org.openapitools.client.ApiClient;
import org.openapitools.client.ApiException;
import org.openapitools.client.Configuration;
import org.openapitools.client.models.*;
import org.openapitools.client.api.DefaultApi;

public class Example {
  public static void main(String[] args) {
    ApiClient defaultClient = Configuration.getDefaultApiClient();
    defaultClient.setBasePath("http://localhost");

    DefaultApi apiInstance = new DefaultApi(defaultClient);
    SearchDPPByCriteriaRequest searchDPPByCriteriaRequest = new SearchDPPByCriteriaRequest(); // SearchDPPByCriteriaRequest | 
    try {
      SearchDPPByCriteriaResponse result = apiInstance.searchDPPByCriteria(searchDPPByCriteriaRequest);
      System.out.println(result);
    } catch (ApiException e) {
      System.err.println("Exception when calling DefaultApi#searchDPPByCriteria");
      System.err.println("Status code: " + e.getCode());
      System.err.println("Reason: " + e.getResponseBody());
      System.err.println("Response headers: " + e.getResponseHeaders());
      e.printStackTrace();
    }
  }
}
```

### Parameters

| Name | Type | Description  | Notes |
|------------- | ------------- | ------------- | -------------|
| **searchDPPByCriteriaRequest** | [**SearchDPPByCriteriaRequest**](SearchDPPByCriteriaRequest.md)|  | [optional] |

### Return type

[**SearchDPPByCriteriaResponse**](SearchDPPByCriteriaResponse.md)

### Authorization

No authorization required

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/json

### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | Successful response |  -  |

<a id="submitProductReview"></a>
# **submitProductReview**
> GenericResponse submitProductReview(submitProductReviewRequest)



Permite deixar avaliacao sobre o produto.

### Example
```java
// Import classes:
import org.openapitools.client.ApiClient;
import org.openapitools.client.ApiException;
import org.openapitools.client.Configuration;
import org.openapitools.client.models.*;
import org.openapitools.client.api.DefaultApi;

public class Example {
  public static void main(String[] args) {
    ApiClient defaultClient = Configuration.getDefaultApiClient();
    defaultClient.setBasePath("http://localhost");

    DefaultApi apiInstance = new DefaultApi(defaultClient);
    SubmitProductReviewRequest submitProductReviewRequest = new SubmitProductReviewRequest(); // SubmitProductReviewRequest | 
    try {
      GenericResponse result = apiInstance.submitProductReview(submitProductReviewRequest);
      System.out.println(result);
    } catch (ApiException e) {
      System.err.println("Exception when calling DefaultApi#submitProductReview");
      System.err.println("Status code: " + e.getCode());
      System.err.println("Reason: " + e.getResponseBody());
      System.err.println("Response headers: " + e.getResponseHeaders());
      e.printStackTrace();
    }
  }
}
```

### Parameters

| Name | Type | Description  | Notes |
|------------- | ------------- | ------------- | -------------|
| **submitProductReviewRequest** | [**SubmitProductReviewRequest**](SubmitProductReviewRequest.md)|  | [optional] |

### Return type

[**GenericResponse**](GenericResponse.md)

### Authorization

No authorization required

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/json

### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | Successful response |  -  |

<a id="subscribeToUpdates"></a>
# **subscribeToUpdates**
> GenericResponse subscribeToUpdates(subscribeToUpdatesRequest)



Subscrever a atualizacoes do DPP.

### Example
```java
// Import classes:
import org.openapitools.client.ApiClient;
import org.openapitools.client.ApiException;
import org.openapitools.client.Configuration;
import org.openapitools.client.models.*;
import org.openapitools.client.api.DefaultApi;

public class Example {
  public static void main(String[] args) {
    ApiClient defaultClient = Configuration.getDefaultApiClient();
    defaultClient.setBasePath("http://localhost");

    DefaultApi apiInstance = new DefaultApi(defaultClient);
    SubscribeToUpdatesRequest subscribeToUpdatesRequest = new SubscribeToUpdatesRequest(); // SubscribeToUpdatesRequest | 
    try {
      GenericResponse result = apiInstance.subscribeToUpdates(subscribeToUpdatesRequest);
      System.out.println(result);
    } catch (ApiException e) {
      System.err.println("Exception when calling DefaultApi#subscribeToUpdates");
      System.err.println("Status code: " + e.getCode());
      System.err.println("Reason: " + e.getResponseBody());
      System.err.println("Response headers: " + e.getResponseHeaders());
      e.printStackTrace();
    }
  }
}
```

### Parameters

| Name | Type | Description  | Notes |
|------------- | ------------- | ------------- | -------------|
| **subscribeToUpdatesRequest** | [**SubscribeToUpdatesRequest**](SubscribeToUpdatesRequest.md)|  | [optional] |

### Return type

[**GenericResponse**](GenericResponse.md)

### Authorization

No authorization required

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/json

### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | Successful response |  -  |

<a id="transferDPP"></a>
# **transferDPP**
> GenericResponse transferDPP(transferDPPRequest)



Transfere a propriedade do DPP para outro ator.

### Example
```java
// Import classes:
import org.openapitools.client.ApiClient;
import org.openapitools.client.ApiException;
import org.openapitools.client.Configuration;
import org.openapitools.client.models.*;
import org.openapitools.client.api.DefaultApi;

public class Example {
  public static void main(String[] args) {
    ApiClient defaultClient = Configuration.getDefaultApiClient();
    defaultClient.setBasePath("http://localhost");

    DefaultApi apiInstance = new DefaultApi(defaultClient);
    TransferDPPRequest transferDPPRequest = new TransferDPPRequest(); // TransferDPPRequest | 
    try {
      GenericResponse result = apiInstance.transferDPP(transferDPPRequest);
      System.out.println(result);
    } catch (ApiException e) {
      System.err.println("Exception when calling DefaultApi#transferDPP");
      System.err.println("Status code: " + e.getCode());
      System.err.println("Reason: " + e.getResponseBody());
      System.err.println("Response headers: " + e.getResponseHeaders());
      e.printStackTrace();
    }
  }
}
```

### Parameters

| Name | Type | Description  | Notes |
|------------- | ------------- | ------------- | -------------|
| **transferDPPRequest** | [**TransferDPPRequest**](TransferDPPRequest.md)|  | [optional] |

### Return type

[**GenericResponse**](GenericResponse.md)

### Authorization

No authorization required

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/json

### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | Successful response |  -  |

<a id="updateRetailData"></a>
# **updateRetailData**
> GenericResponse updateRetailData(updateRetailDataRequest)



Adiciona ao DPP dados sobre o varejo (dispositorio de loja).

### Example
```java
// Import classes:
import org.openapitools.client.ApiClient;
import org.openapitools.client.ApiException;
import org.openapitools.client.Configuration;
import org.openapitools.client.models.*;
import org.openapitools.client.api.DefaultApi;

public class Example {
  public static void main(String[] args) {
    ApiClient defaultClient = Configuration.getDefaultApiClient();
    defaultClient.setBasePath("http://localhost");

    DefaultApi apiInstance = new DefaultApi(defaultClient);
    UpdateRetailDataRequest updateRetailDataRequest = new UpdateRetailDataRequest(); // UpdateRetailDataRequest | 
    try {
      GenericResponse result = apiInstance.updateRetailData(updateRetailDataRequest);
      System.out.println(result);
    } catch (ApiException e) {
      System.err.println("Exception when calling DefaultApi#updateRetailData");
      System.err.println("Status code: " + e.getCode());
      System.err.println("Reason: " + e.getResponseBody());
      System.err.println("Response headers: " + e.getResponseHeaders());
      e.printStackTrace();
    }
  }
}
```

### Parameters

| Name | Type | Description  | Notes |
|------------- | ------------- | ------------- | -------------|
| **updateRetailDataRequest** | [**UpdateRetailDataRequest**](UpdateRetailDataRequest.md)|  | [optional] |

### Return type

[**GenericResponse**](GenericResponse.md)

### Authorization

No authorization required

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/json

### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | Successful response |  -  |

<a id="updateTransportData"></a>
# **updateTransportData**
> GenericResponse updateTransportData(updateTransportDataRequest)



Adiciona ao DPP os condicoes do processo de transporte.

### Example
```java
// Import classes:
import org.openapitools.client.ApiClient;
import org.openapitools.client.ApiException;
import org.openapitools.client.Configuration;
import org.openapitools.client.models.*;
import org.openapitools.client.api.DefaultApi;

public class Example {
  public static void main(String[] args) {
    ApiClient defaultClient = Configuration.getDefaultApiClient();
    defaultClient.setBasePath("http://localhost");

    DefaultApi apiInstance = new DefaultApi(defaultClient);
    UpdateTransportDataRequest updateTransportDataRequest = new UpdateTransportDataRequest(); // UpdateTransportDataRequest | 
    try {
      GenericResponse result = apiInstance.updateTransportData(updateTransportDataRequest);
      System.out.println(result);
    } catch (ApiException e) {
      System.err.println("Exception when calling DefaultApi#updateTransportData");
      System.err.println("Status code: " + e.getCode());
      System.err.println("Reason: " + e.getResponseBody());
      System.err.println("Response headers: " + e.getResponseHeaders());
      e.printStackTrace();
    }
  }
}
```

### Parameters

| Name | Type | Description  | Notes |
|------------- | ------------- | ------------- | -------------|
| **updateTransportDataRequest** | [**UpdateTransportDataRequest**](UpdateTransportDataRequest.md)|  | [optional] |

### Return type

[**GenericResponse**](GenericResponse.md)

### Authorization

No authorization required

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/json

### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | Successful response |  -  |

<a id="verifyDPPAuthenticity"></a>
# **verifyDPPAuthenticity**
> VerifyDPPAuthenticityResponse verifyDPPAuthenticity(verifyDPPAuthenticityRequest)



Verifica se o DPP e um NFT legitimo e a sua proveniencia.

### Example
```java
// Import classes:
import org.openapitools.client.ApiClient;
import org.openapitools.client.ApiException;
import org.openapitools.client.Configuration;
import org.openapitools.client.models.*;
import org.openapitools.client.api.DefaultApi;

public class Example {
  public static void main(String[] args) {
    ApiClient defaultClient = Configuration.getDefaultApiClient();
    defaultClient.setBasePath("http://localhost");

    DefaultApi apiInstance = new DefaultApi(defaultClient);
    VerifyDPPAuthenticityRequest verifyDPPAuthenticityRequest = new VerifyDPPAuthenticityRequest(); // VerifyDPPAuthenticityRequest | 
    try {
      VerifyDPPAuthenticityResponse result = apiInstance.verifyDPPAuthenticity(verifyDPPAuthenticityRequest);
      System.out.println(result);
    } catch (ApiException e) {
      System.err.println("Exception when calling DefaultApi#verifyDPPAuthenticity");
      System.err.println("Status code: " + e.getCode());
      System.err.println("Reason: " + e.getResponseBody());
      System.err.println("Response headers: " + e.getResponseHeaders());
      e.printStackTrace();
    }
  }
}
```

### Parameters

| Name | Type | Description  | Notes |
|------------- | ------------- | ------------- | -------------|
| **verifyDPPAuthenticityRequest** | [**VerifyDPPAuthenticityRequest**](VerifyDPPAuthenticityRequest.md)|  | [optional] |

### Return type

[**VerifyDPPAuthenticityResponse**](VerifyDPPAuthenticityResponse.md)

### Authorization

No authorization required

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/json

### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | Successful response |  -  |

