# Medical Specialists Directory

Academic project that provides a medical specialists directory using Firebase and Google Cloud Platform (GCP). It exposes a REST API with two endpoints to help locate healthcare professionals in underserved areas.

```mermaid
flowchart TB
    subgraph Cliente["Cliente"]
        UI[UI minima<br/>Firebase Hosting]
    end

    subgraph Interfaces["Capa de interfaces - HTTP"]
        direction TB
        WL{{"Middleware<br/>WHITELIST DE IPs"}}
        C1[Controller<br/>sync-places]
        C2[Controller<br/>get-places]
        WL --> C1
        WL --> C2
        WL -.->|IP no autorizada| ERR[Error 403]
    end

    subgraph Application["Capa de aplicacion - casos de uso"]
        direction TB
        UC1[SyncPlacesUseCase<br/>maneja paginacion]
        UC2[GetPlacesUseCase]
    end

    subgraph Domain["Capa de dominio"]
        direction TB
        PR[["PlacesRepository<br/>interfaz / puerto"]]
        PP[["PlacesProvider<br/>interfaz / puerto"]]
    end

    subgraph Infra["Capa de infraestructura - adaptadores"]
        direction TB
        REPO[FirestorePlacesRepository]
        ADAPTER[GooglePlacesAdapter]
    end

    SM[/"Secret Manager / env vars<br/>API key de Maps"/]
    DB[("FIRESTORE<br/>base de datos propia<br/>cache persistente")]
    GP["GOOGLE MAPS PLATFORM<br/>Places API"]

    UI -->|HTTPS request| WL
    C1 --> UC1
    C2 --> UC2
    UC1 --> PR
    UC1 --> PP
    UC2 --> PR
    PR -.->|implementa| REPO
    PP -.->|implementa| ADAPTER
    REPO --> DB
    ADAPTER -->|lee API key| SM
    ADAPTER -->|solicita lugares<br/>50 resultados, 10 por pagina| GP
    GP --> ADAPTER

    style GP fill:#4285F4,color:#fff
    style DB fill:#FFA000,color:#fff
    style WL fill:#DB4437,color:#fff
    style SM fill:#0F9D58,color:#fff
    style Domain fill:#37474F,color:#fff
```
