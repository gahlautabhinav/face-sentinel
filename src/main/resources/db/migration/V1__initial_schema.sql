CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE tenants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    rekognition_collection_id VARCHAR(255) NOT NULL UNIQUE,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE visitors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255),
    phone VARCHAR(50),
    metadata JSONB,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_visitors_tenant_id ON visitors(tenant_id);

CREATE TABLE visitor_faces (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    visitor_id UUID NOT NULL REFERENCES visitors(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    rekognition_face_id VARCHAR(255) NOT NULL,
    s3_image_key VARCHAR(512) NOT NULL,
    confidence DOUBLE PRECISION,
    enrolled_at TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE(tenant_id, rekognition_face_id),
    UNIQUE(visitor_id, tenant_id)
);

CREATE INDEX idx_visitor_faces_tenant_id ON visitor_faces(tenant_id);
CREATE INDEX idx_visitor_faces_rekognition_face_id ON visitor_faces(rekognition_face_id);
CREATE INDEX idx_visitor_faces_visitor_id ON visitor_faces(visitor_id);

CREATE TABLE recognition_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    visitor_id UUID REFERENCES visitors(id),
    action VARCHAR(20) NOT NULL,
    status VARCHAR(20) NOT NULL,
    similarity DOUBLE PRECISION,
    s3_image_key VARCHAR(512),
    error_message TEXT,
    ip_address VARCHAR(45),
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_recognition_logs_tenant_id ON recognition_logs(tenant_id);
CREATE INDEX idx_recognition_logs_visitor_id ON recognition_logs(visitor_id);
CREATE INDEX idx_recognition_logs_created_at ON recognition_logs(created_at DESC);
CREATE INDEX idx_recognition_logs_action_status ON recognition_logs(action, status);
