# ThaiReport HTTP API (tr-server) — build หลายขั้น
# ภาพขั้นสุดท้ายมีแค่ไบนารี + ฟอนต์ + template ตัวอย่าง รันด้วยผู้ใช้ที่ไม่ใช่ root
#
#   docker build -t thaireport .
#   docker run --rm -p 8080:8080 thaireport
#   curl http://localhost:8080/health

FROM rust:1-bookworm AS build
WORKDIR /src
# rust-toolchain.toml ของ repo ปักไว้ที่ toolchain Windows — ใช้ stable ของภาพแทน
ENV RUSTUP_TOOLCHAIN=stable
COPY . .
RUN cargo build --release -p tr-server

FROM debian:bookworm-slim
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates curl \
    && rm -rf /var/lib/apt/lists/* \
    && useradd --system --uid 10001 --no-create-home thaireport
COPY --from=build /src/target/release/tr-server /usr/local/bin/tr-server
COPY fonts /opt/thaireport/fonts
COPY templates /opt/thaireport/templates
ENV TR_BIND=0.0.0.0:8080 \
    TR_FONTS_DIR=/opt/thaireport/fonts \
    TR_TEMPLATES_DIR=/opt/thaireport/templates \
    TR_MAX_BODY_MB=5
USER 10001
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s CMD curl -fsS http://127.0.0.1:8080/health || exit 1
ENTRYPOINT ["/usr/local/bin/tr-server"]
