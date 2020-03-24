\simple_isosurface.fs
#version 300 es
precision highp float;
precision highp sampler3D;
precision highp isampler3D;
precision highp usampler3D;

in vec3 v_pos;
in vec3 v_normal;
in vec2 v_coord;

out vec4 color_final;

uniform vec3 u_camera_position;
uniform vec3 u_local_camera_position;
uniform mat4 u_mvp;

uniform vec3 u_position;
uniform vec3 u_resolution;
uniform vec4 u_background;
uniform float u_min_value;
uniform float u_max_value;

uniform sampler2D u_tf_texture;

#if TEXTURE_TYPE == 0
uniform sampler3D u_volume_texture;
#elif TEXTURE_TYPE == 1
uniform isampler3D u_volume_texture;
#else
uniform usampler3D u_volume_texture;
#endif

uniform float u_intensity;
uniform float u_levelOfDetail;

uniform vec4 u_cutting_plane;
uniform bool u_cutting_plane_active;

//Custom uniforms
uniform float u_isosurface_value;
uniform float u_isosurface_margin;

//Global
const vec3 light_pos = vec3(10.0, 0.0, 0.0);

// Return point where the ray enters the box. If the ray originates inside the box it returns the origin.
vec3 rayOrigin(in vec3 ro, in vec3 rd){
    if(abs(ro.x) <= 1.0 && abs(ro.y) <= 1.0 && abs(ro.z) <= 1.0) return ro;
    vec3 ip;
    // Only one these 3 sides can hold the ray origin. The other 3 faces will never hold it
    vec3 sides = vec3(-sign(rd.x),-sign(rd.y),-sign(rd.z));
    for(int i=0; i<3; i++){
        float c = (sides[i] - ro[i]) / rd[i];
        ip[i] = sides[i];
        ip[(i+1)%3] = c*rd[(i+1)%3]+ro[(i+1)%3];
        ip[(i+2)%3] = c*rd[(i+2)%3]+ro[(i+2)%3];
        if(abs(ip[(i+1)%3]) <= 1.0 && abs(ip[(i+2)%3]) <= 1.0) break;
    }
    return ip;
}

//Pseudo random function from thebookofshaders.com/10/
float random (vec2 st) {
    return fract(sin(dot(st.xy, vec2(12.9898,78.233)))* 43758.5453123);
}

// Returns voxel XYZW value
vec4 getVoxel( vec3 pos ){
    vec3 texture_pos = 0.5*(pos + vec3(1.0)); //Voxel coordinates in texture space [0, 1]
    vec4 v = vec4(texture( u_volume_texture, texture_pos));

    #if NORMALIZE_VOXEL_VALUE == 1
    v = (v - vec4(u_min_value)) / (u_max_value - u_min_value);
    #endif

    return v;
}

vec3 gradient(vec3 pos, float delta){
	vec3 s1 = vec3(getVoxel(pos-vec3(delta, 0.0, 0.0)).x, getVoxel(pos-vec3(0.0, delta, 0.0)).x, getVoxel(pos-vec3(0.0, 0.0, delta)).x);
	vec3 s2 = vec3(getVoxel(pos+vec3(delta, 0.0, 0.0)).x, getVoxel(pos+vec3(0.0, delta, 0.0)).x, getVoxel(pos+vec3(0.0, 0.0, delta)).x);
	return (s2-s1);
}

vec3 shade(vec3 N, vec3 V, vec3 L, vec3 color){
	//Material, change for classify
	vec3 Kd = color;
	vec3 Ks = vec3(0.2);
	float n = 100.0;

	//Light
	vec3 lightColor = vec3(0.9);

	//Halfway vector
	vec3 H = normalize(L + V);
	
	//Diffuse
	float diffuseLight = (dot(L, N)+1.0)*0.5;
    diffuseLight = diffuseLight * 0.6 + 0.4;
	vec3 diffuse = Kd * lightColor * diffuseLight;

	//Specular
	float specularLight = pow(max(dot(H, N), 0.0), n);
	if(diffuseLight <= 0.0) specularLight = 0.0;
	vec3 specular = Ks * lightColor * specularLight;

	return diffuse + specular;
}

void main() {
    // Compute ray origin and direction in volume space [-1,1]
    vec3 ray_exit = v_pos;
    vec3 ray_direction = normalize(ray_exit - u_local_camera_position);
    vec3 ray_origin = rayOrigin(u_local_camera_position, ray_direction);

    // Ray step and sample
    vec3 ray_step = ray_direction * (1.0 / u_levelOfDetail);
    float step_length = length(ray_direction);

    vec3 ray_sample = ray_origin - ray_step*random(gl_FragCoord.xy);

    // Variables for light computation
    float delta = (1.0 / 100.0);
    vec3 N, L, V;

    // Initialize cdest vec4 to store color
    vec4 color_accumulated = vec4(0.0);
    vec4 color_step = vec4(0.0);
    vec4 color_prev = vec4(0.0);

    // Use raymarching algorithm
    for(int i=0; i<10000; i++){
        if(!u_cutting_plane_active || (u_cutting_plane.x*ray_sample.x + u_cutting_plane.y*ray_sample.y + u_cutting_plane.z*ray_sample.z + u_cutting_plane.w > 0.0) ){
            // Interpolation
            float f = getVoxel(ray_sample).x;

            // Classification
            vec4 color_sample = texture( u_tf_texture, vec2(f,0.0) );
            //color_sample.rgb = color_sample.rgb * color_sample.a; //transparency, applied this way to avoid color bleeding
            
            // Compositing
            if(abs(f-u_isosurface_value) < u_isosurface_margin){
                //Gradient on-the-fly
                N = normalize(gradient(ray_sample, delta));
                V = normalize(ray_sample-u_local_camera_position);
                L = normalize(ray_sample - light_pos);
                vec3 color = shade(N, V, L, color_sample.rgb);

                color_accumulated = vec4(color, 1.0);

                break;  //This simple isosurface only renders 1 surface. Once reached it does not render anything more.
            }
        }

        ray_sample = ray_sample + ray_step;

        vec3 absrs = abs(ray_sample);
        if(i > 1 && (absrs.x > 1.0 || absrs.y > 1.0 || absrs.z > 1.0)) break;
    }
        
    // Final color
    color_accumulated = color_accumulated * u_intensity;
    if(color_accumulated.w < 0.01) discard;
    color_final = u_background * (1.0 - color_accumulated.w) + color_accumulated;
}